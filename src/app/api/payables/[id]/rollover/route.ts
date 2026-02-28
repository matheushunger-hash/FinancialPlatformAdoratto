import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { computeDisplayStatus } from "@/lib/payables/status";

// =============================================================================
// PATCH /api/payables/[id]/rollover — Reschedule a payable's scheduledDate
// =============================================================================
// Updates only scheduledDate (never dueDate) and creates an AuditLog record.
// This is the "rollover" action: when an overdue bill is rescheduled to a new
// operational date instead of being paid or cancelled.
// =============================================================================

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (ctx.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Apenas administradores podem reagendar títulos" },
      { status: 403 },
    );
  }

  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  let body: { toDate?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { toDate, reason } = body;

  // Validate toDate format
  if (!toDate || !DATE_REGEX.test(toDate)) {
    return NextResponse.json(
      { error: "Campo 'toDate' é obrigatório (formato: yyyy-MM-dd)" },
      { status: 400 },
    );
  }

  // Validate toDate is a real date and not in the past
  const newScheduledDate = new Date(toDate + "T12:00:00");
  if (isNaN(newScheduledDate.getTime())) {
    return NextResponse.json(
      { error: "Data inválida" },
      { status: 400 },
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (newScheduledDate < today) {
    return NextResponse.json(
      { error: "Não é possível reagendar para uma data no passado" },
      { status: 400 },
    );
  }

  try {
    const payable = await prisma.payable.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { supplier: { select: { name: true } } },
    });

    if (!payable) {
      return NextResponse.json(
        { error: "Título não encontrado" },
        { status: 404 },
      );
    }

    // Guard: can't rollover PAID or CANCELLED payables
    if (payable.actionStatus === "PAID" || payable.actionStatus === "CANCELLED") {
      return NextResponse.json(
        { error: "Não é possível reagendar um título pago ou cancelado" },
        { status: 400 },
      );
    }

    // Capture before snapshot
    const beforeSnapshot = {
      scheduledDate: payable.scheduledDate.toISOString().split("T")[0],
    };

    // Update scheduledDate (never touch dueDate)
    const updated = await prisma.payable.update({
      where: { id },
      data: { scheduledDate: newScheduledDate },
      include: { supplier: { select: { name: true } } },
    });

    // Create audit log record
    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "rollover",
        entityType: "payable",
        entityId: id,
        before: beforeSnapshot,
        after: { scheduledDate: toDate, ...(reason ? { reason } : {}) },
      },
    });

    const ds = computeDisplayStatus(updated.actionStatus, updated.dueDate);

    return NextResponse.json({
      id: updated.id,
      actionStatus: updated.actionStatus,
      displayStatus: ds,
      scheduledDate: updated.scheduledDate.toISOString(),
      supplierName: updated.supplier?.name ?? updated.payee ?? null,
      description: updated.description,
    });
  } catch (err) {
    console.error("[PATCH /api/payables/[id]/rollover] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
