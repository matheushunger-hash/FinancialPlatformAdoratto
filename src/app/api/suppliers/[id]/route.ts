import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { supplierFormSchema, stripDocument } from "@/lib/suppliers/validation";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// =============================================================================
// GET /api/suppliers/[id] — Get a single supplier
// =============================================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  try {
    // Scope by userId — prevents users from viewing another user's supplier
    const supplier = await prisma.supplier.findFirst({ where: { id, userId: user.id } });

    if (!supplier) {
      return NextResponse.json({ error: "Fornecedor não encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      ...supplier,
      createdAt: supplier.createdAt.toISOString(),
      updatedAt: supplier.updatedAt.toISOString(),
    });
  } catch (err) {
    console.error("[GET /api/suppliers/[id]] error:", err);
    const message = err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// =============================================================================
// PATCH /api/suppliers/[id] — Update a supplier
// =============================================================================
// Two modes:
//   1. Status toggle: body = { active: boolean }
//      If deactivating, checks for PENDING/OVERDUE payables first.
//   2. Field edit: validates full form data with Zod, checks document uniqueness.
// =============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    // Verify the supplier exists AND belongs to this user (ownership check)
    const existing = await prisma.supplier.findFirst({ where: { id, userId: user.id } });
    if (!existing) {
      return NextResponse.json({ error: "Fornecedor não encontrado" }, { status: 404 });
    }

    // --- Mode 1: Status toggle (soft delete / reactivate) ---
    if (typeof body === "object" && body !== null && "active" in body && Object.keys(body).length === 1) {
      const active = Boolean((body as { active: unknown }).active);

      // If deactivating, check for open payables linked to this supplier
      if (!active) {
        const openPayables = await prisma.payable.count({
          where: {
            supplierId: id,
            status: { in: ["PENDING", "OVERDUE"] },
          },
        });

        if (openPayables > 0) {
          return NextResponse.json(
            {
              error: `Não é possível desativar: fornecedor possui ${openPayables} título(s) em aberto`,
            },
            { status: 409 },
          );
        }
      }

      const updated = await prisma.supplier.update({
        where: { id },
        data: { active },
      });

      return NextResponse.json({
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      });
    }

    // --- Mode 2: Full field edit ---
    const parsed = supplierFormSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const strippedDocument = stripDocument(data.document);

    // Check document uniqueness, excluding the current supplier
    const duplicate = await prisma.supplier.findFirst({
      where: { document: strippedDocument, userId: user.id },
    });

    if (duplicate && duplicate.id !== id) {
      return NextResponse.json(
        { error: "Já existe um fornecedor com este documento", field: "document" },
        { status: 409 },
      );
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        name: data.name,
        documentType: data.documentType,
        document: strippedDocument,
        tradeName: data.tradeName || null,
        contactName: data.contactName || null,
        email: data.email || null,
        phone: data.phone || null,
        bankName: data.bankName || null,
        bankAgency: data.bankAgency || null,
        bankAccount: data.bankAccount || null,
        pixKey: data.pixKey || null,
        notes: data.notes || null,
      },
    });

    return NextResponse.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (err) {
    // P2002 = unique constraint violation — race condition safety net
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "Já existe um fornecedor com este documento", field: "document" },
        { status: 409 },
      );
    }
    console.error("[PATCH /api/suppliers/[id]] error:", err);
    const message = err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
