import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getAuthContext } from "@/lib/auth/context";
import { supplierFormSchema, stripDocument } from "@/lib/suppliers/validation";
import type { SuppliersListResponse } from "@/lib/suppliers/types";

// =============================================================================
// GET /api/suppliers — List suppliers with pagination and search
// =============================================================================
// Query params: page (default 1), pageSize (default 10), search (optional)
// Search looks across name, tradeName (case-insensitive), and document (digits).
// Returns all supplier fields so the UI doesn't need a second fetch for editing.
// =============================================================================

export async function GET(request: NextRequest) {
  // 1. Authenticate — returns userId, tenantId, and role in one call
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse query parameters
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize")) || 10));
  const search = searchParams.get("search")?.trim() || "";

  // 3. Build the WHERE clause for filtering
  // Always search document as text (for "PENDENTE-001" placeholders).
  // Also search by stripped digits when the term has any (for CNPJ/CPF).
  const searchConditions: Prisma.SupplierWhereInput[] = [];
  if (search) {
    searchConditions.push(
      { name: { contains: search, mode: "insensitive" as const } },
      { tradeName: { contains: search, mode: "insensitive" as const } },
      { document: { contains: search, mode: "insensitive" as const } },
    );
    const strippedSearch = stripDocument(search);
    if (strippedSearch && strippedSearch !== search) {
      searchConditions.push({ document: { contains: strippedSearch } });
    }
  }

  const where: Prisma.SupplierWhereInput = {
    tenantId: ctx.tenantId,
    ...(searchConditions.length > 0 && { OR: searchConditions }),
  };

  // 4. Run both queries in parallel — count for pagination, find for data
  const [total, suppliers] = await Promise.all([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const response: SuppliersListResponse = {
    suppliers: suppliers.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };

  return NextResponse.json(response);
}

// =============================================================================
// POST /api/suppliers — Create a new supplier
// =============================================================================
// Validates with Zod, strips document to digits, checks uniqueness, creates.
// Returns 201 with the created supplier, or 409 if document already exists.
// =============================================================================

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate the request body against our Zod schema
  const parsed = supplierFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const strippedDocument = stripDocument(data.document);

  try {
    // Check for duplicate document within this tenant
    // (the DB unique constraint is a safety net, but we want a friendly error)
    const existing = await prisma.supplier.findFirst({
      where: { document: strippedDocument, tenantId: ctx.tenantId },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Já existe um fornecedor com este documento", field: "document" },
        { status: 409 },
      );
    }

    const supplier = await prisma.supplier.create({
      data: {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
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

    return NextResponse.json(
      {
        ...supplier,
        createdAt: supplier.createdAt.toISOString(),
        updatedAt: supplier.updatedAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (err) {
    // P2002 = unique constraint violation — race condition safety net
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "Já existe um fornecedor com este documento", field: "document" },
        { status: 409 },
      );
    }
    console.error("[POST /api/suppliers] error:", err);
    const message = err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
