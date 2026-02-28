import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { payableFormSchema, parseCurrency } from "@/lib/payables/validation";
import { isEditable } from "@/lib/payables/types";
import { computeDisplayStatus } from "@/lib/payables/status";
import type { PayableDetail } from "@/lib/payables/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Helper: build a PayableDetail response from a Prisma result
function buildDetailResponse(
  payable: {
    id: string;
    supplierId: string | null;
    supplier: { name: string; document: string; documentType: string } | null;
    payee: string | null;
    description: string;
    category: string;
    issueDate: Date;
    dueDate: Date;
    scheduledDate: Date | null;
    amount: { toString(): string };
    payValue: { toString(): string };
    jurosMulta: { toString(): string } | null;
    paymentMethod: string;
    invoiceNumber: string | null;
    notes: string | null;
    tags: string[];
    actionStatus: string | null;
    source: string;
    createdAt: Date;
    updatedAt: Date;
    approvedBy: string | null;
    approvedAt: Date | null;
    paidAt: Date | null;
    markedPaidAt: Date | null;
    overdueTrackedAt: Date | null;
    userId: string;
    attachments: Array<{
      id: string;
      fileName: string;
      fileUrl: string;
      fileSize: number;
      mimeType: string;
      createdAt: Date;
    }>;
  },
  creatorName: string,
  approverName: string | null,
): PayableDetail {
  const ds = computeDisplayStatus(
    payable.actionStatus as import("@prisma/client").ActionStatus | null,
    payable.dueDate,
  );

  const todayForAging = new Date();
  todayForAging.setHours(0, 0, 0, 0);
  const todayMs = todayForAging.getTime();
  const isOverdue = payable.actionStatus === null && payable.dueDate.getTime() < todayMs;

  return {
    id: payable.id,
    supplierId: payable.supplierId,
    supplierName: payable.supplier?.name ?? null,
    supplierDocument: payable.supplier?.document ?? null,
    supplierDocumentType: (payable.supplier?.documentType as "CNPJ" | "CPF") ?? null,
    payee: payable.payee ?? null,
    description: payable.description,
    category: payable.category as "REVENDA" | "DESPESA",
    issueDate: payable.issueDate.toISOString(),
    dueDate: payable.dueDate.toISOString(),
    scheduledDate: payable.scheduledDate?.toISOString() ?? null,
    amount: payable.amount.toString(),
    payValue: payable.payValue.toString(),
    jurosMulta: payable.jurosMulta?.toString() ?? "0",
    daysOverdue: isOverdue
      ? Math.floor((todayMs - payable.dueDate.getTime()) / 86_400_000)
      : null,
    paymentMethod: payable.paymentMethod,
    invoiceNumber: payable.invoiceNumber,
    notes: payable.notes,
    tags: payable.tags,
    actionStatus: payable.actionStatus,
    displayStatus: ds,
    source: payable.source,
    createdAt: payable.createdAt.toISOString(),
    updatedAt: payable.updatedAt.toISOString(),
    approvedBy: payable.approvedBy,
    approvedAt: payable.approvedAt?.toISOString() ?? null,
    paidAt: payable.paidAt?.toISOString() ?? null,
    markedPaidAt: payable.markedPaidAt?.toISOString() ?? null,
    overdueTrackedAt: payable.overdueTrackedAt?.toISOString()?.split("T")[0] ?? null,
    createdByName: creatorName,
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
}

const PAYABLE_INCLUDE = {
  supplier: {
    select: { name: true, document: true, documentType: true },
  },
  attachments: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      fileName: true,
      fileUrl: true,
      fileSize: true,
      mimeType: true,
      createdAt: true,
    },
  },
};

// =============================================================================
// GET /api/payables/[id] — Fetch a single payable with full detail
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
      include: PAYABLE_INCLUDE,
    });

    if (!payable) {
      return NextResponse.json(
        { error: "Título não encontrado" },
        { status: 404 },
      );
    }

    const creator = await prisma.user.findUnique({
      where: { id: payable.userId },
      select: { name: true },
    });

    let approverName: string | null = null;
    if (payable.approvedBy) {
      const approver = await prisma.user.findUnique({
        where: { id: payable.approvedBy },
        select: { name: true },
      });
      approverName = approver?.name ?? null;
    }

    return NextResponse.json(
      buildDetailResponse(
        payable as Parameters<typeof buildDetailResponse>[0],
        creator?.name ?? "Usuário desconhecido",
        approverName,
      ),
    );
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
// Only allows editing when actionStatus is null (temporal) or APPROVED.
// dueDate is immutable after creation — use scheduledDate instead.
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
    const existing = await prisma.payable.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Título não encontrado" },
        { status: 404 },
      );
    }

    // Editability check: actionStatus must be null or APPROVED
    if (!isEditable(existing.actionStatus)) {
      return NextResponse.json(
        { error: "Este título não pode ser editado no status atual" },
        { status: 400 },
      );
    }

    const parsed = payableFormSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const data = parsed.data;

    const parsedAmount = parseCurrency(data.amount);
    const parsedPayValue = parseCurrency(data.payValue);
    const jurosMulta = parsedPayValue > parsedAmount ? parsedPayValue - parsedAmount : 0;

    // Update all form fields EXCEPT supplierId, status, and dueDate (immutable)
    const updated = await prisma.payable.update({
      where: { id },
      data: {
        description: data.description,
        category: data.category,
        amount: parsedAmount,
        payValue: parsedPayValue,
        jurosMulta,
        issueDate: new Date(data.issueDate + "T12:00:00"),
        // dueDate is immutable after creation
        scheduledDate: data.scheduledDate
          ? new Date(data.scheduledDate + "T12:00:00")
          : undefined,
        paymentMethod: data.paymentMethod,
        invoiceNumber: data.invoiceNumber || null,
        tags: data.tags,
        notes: data.notes || null,
      },
      include: PAYABLE_INCLUDE,
    });

    const creator = await prisma.user.findUnique({
      where: { id: updated.userId },
      select: { name: true },
    });

    let approverName: string | null = null;
    if (updated.approvedBy) {
      const approver = await prisma.user.findUnique({
        where: { id: updated.approvedBy },
        select: { name: true },
      });
      approverName = approver?.name ?? null;
    }

    return NextResponse.json(
      buildDetailResponse(
        updated as Parameters<typeof buildDetailResponse>[0],
        creator?.name ?? "Usuário desconhecido",
        approverName,
      ),
    );
  } catch (err) {
    console.error("[PATCH /api/payables/[id]] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// =============================================================================
// DELETE /api/payables/[id] — Permanently delete a payable (ADMIN only)
// =============================================================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const payable = await prisma.payable.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!payable) {
      return NextResponse.json(
        { error: "Título não encontrado" },
        { status: 404 },
      );
    }

    const attachments = await prisma.attachment.findMany({
      where: { payableId: id },
      select: { fileUrl: true },
    });

    if (attachments.length > 0) {
      const filePaths = attachments.map((a) => a.fileUrl);
      const supabase = await createClient();
      const { error: storageError } = await supabase.storage
        .from("attachments")
        .remove(filePaths);

      if (storageError) {
        console.error("[DELETE /api/payables/[id]] Storage error:", storageError);
      }
    }

    await prisma.payable.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/payables/[id]] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
