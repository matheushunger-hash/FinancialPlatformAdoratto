import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { payableFormSchema, parseCurrency } from "@/lib/payables/validation";
import { EDITABLE_STATUSES } from "@/lib/payables/types";
import type { PayableDetail } from "@/lib/payables/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// =============================================================================
// GET /api/payables/[id] — Fetch a single payable with full detail
// =============================================================================
// Returns PayableDetail shape — includes creator/approver names that the edit
// form needs for its read-only metadata panel.
// =============================================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const payable = await prisma.payable.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        supplier: {
          select: { name: true, document: true, documentType: true },
        },
        attachments: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            fileName: true,
            fileUrl: true,
            fileSize: true,
            mimeType: true,
            createdAt: true,
          },
        },
      },
    });

    if (!payable) {
      return NextResponse.json(
        { error: "Título não encontrado" },
        { status: 404 },
      );
    }

    // Look up creator name from users table
    const creator = await prisma.user.findUnique({
      where: { id: payable.userId },
      select: { name: true },
    });

    // Look up approver name if the payable has been approved
    let approverName: string | null = null;
    if (payable.approvedBy) {
      const approver = await prisma.user.findUnique({
        where: { id: payable.approvedBy },
        select: { name: true },
      });
      approverName = approver?.name ?? null;
    }

    const detail: PayableDetail = {
      id: payable.id,
      supplierId: payable.supplierId,
      supplierName: payable.supplier.name,
      supplierDocument: payable.supplier.document,
      supplierDocumentType: payable.supplier.documentType as "CNPJ" | "CPF",
      description: payable.description,
      category: payable.category,
      issueDate: payable.issueDate.toISOString(),
      dueDate: payable.dueDate.toISOString(),
      amount: payable.amount.toString(),
      payValue: payable.payValue.toString(),
      paymentMethod: payable.paymentMethod,
      invoiceNumber: payable.invoiceNumber,
      notes: payable.notes,
      tags: payable.tags,
      status: payable.status,
      createdAt: payable.createdAt.toISOString(),
      updatedAt: payable.updatedAt.toISOString(),
      approvedBy: payable.approvedBy,
      approvedAt: payable.approvedAt?.toISOString() ?? null,
      paidAt: payable.paidAt?.toISOString() ?? null,
      createdByName: creator?.name ?? "Usuário desconhecido",
      approvedByName: approverName,
      attachments: payable.attachments.map((a) => ({
        id: a.id,
        payableId: payable.id,
        fileName: a.fileName,
        fileUrl: a.fileUrl,
        fileSize: a.fileSize,
        mimeType: a.mimeType,
        createdAt: a.createdAt.toISOString(),
      })),
    };

    return NextResponse.json(detail);
  } catch (err) {
    console.error("[GET /api/payables/[id]] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// =============================================================================
// PATCH /api/payables/[id] — Update a payable's editable fields
// =============================================================================
// Only allows editing when status is PENDING, APPROVED, or REJECTED.
// Terminal statuses (PAID, OVERDUE, CANCELLED) are locked.
// The supplier (supplierId) cannot be changed after creation.
// =============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) {
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
    // Verify the payable exists and belongs to this tenant
    const existing = await prisma.payable.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Título não encontrado" },
        { status: 404 },
      );
    }

    // Check if the payable's status allows editing
    if (!EDITABLE_STATUSES.includes(existing.status as typeof EDITABLE_STATUSES[number])) {
      return NextResponse.json(
        { error: "Este título não pode ser editado no status atual" },
        { status: 400 },
      );
    }

    // Validate the request body with the same Zod schema used for creation
    const parsed = payableFormSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Convert currency strings to numbers for Prisma's Decimal type
    const parsedAmount = parseCurrency(data.amount);
    const parsedPayValue = parseCurrency(data.payValue);

    // Update all form fields EXCEPT supplierId and status
    const updated = await prisma.payable.update({
      where: { id },
      data: {
        description: data.description,
        category: data.category,
        amount: parsedAmount,
        payValue: parsedPayValue,
        issueDate: new Date(data.issueDate + "T12:00:00"),
        dueDate: new Date(data.dueDate + "T12:00:00"),
        paymentMethod: data.paymentMethod,
        invoiceNumber: data.invoiceNumber || null,
        tags: data.tags,
        notes: data.notes || null,
      },
      include: {
        supplier: {
          select: { name: true, document: true, documentType: true },
        },
        attachments: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            fileName: true,
            fileUrl: true,
            fileSize: true,
            mimeType: true,
            createdAt: true,
          },
        },
      },
    });

    // Look up creator name
    const creator = await prisma.user.findUnique({
      where: { id: updated.userId },
      select: { name: true },
    });

    // Look up approver name if applicable
    let approverName: string | null = null;
    if (updated.approvedBy) {
      const approver = await prisma.user.findUnique({
        where: { id: updated.approvedBy },
        select: { name: true },
      });
      approverName = approver?.name ?? null;
    }

    const detail: PayableDetail = {
      id: updated.id,
      supplierId: updated.supplierId,
      supplierName: updated.supplier.name,
      supplierDocument: updated.supplier.document,
      supplierDocumentType: updated.supplier.documentType as "CNPJ" | "CPF",
      description: updated.description,
      category: updated.category,
      issueDate: updated.issueDate.toISOString(),
      dueDate: updated.dueDate.toISOString(),
      amount: updated.amount.toString(),
      payValue: updated.payValue.toString(),
      paymentMethod: updated.paymentMethod,
      invoiceNumber: updated.invoiceNumber,
      notes: updated.notes,
      tags: updated.tags,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      approvedBy: updated.approvedBy,
      approvedAt: updated.approvedAt?.toISOString() ?? null,
      paidAt: updated.paidAt?.toISOString() ?? null,
      createdByName: creator?.name ?? "Usuário desconhecido",
      approvedByName: approverName,
      attachments: updated.attachments.map((a) => ({
        id: a.id,
        payableId: updated.id,
        fileName: a.fileName,
        fileUrl: a.fileUrl,
        fileSize: a.fileSize,
        mimeType: a.mimeType,
        createdAt: a.createdAt.toISOString(),
      })),
    };

    return NextResponse.json(detail);
  } catch (err) {
    console.error("[PATCH /api/payables/[id]] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
