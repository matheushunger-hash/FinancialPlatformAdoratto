import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { TRANSITIONS } from "@/lib/payables/transitions";
import { computeDisplayStatus } from "@/lib/payables/status";
import type { ActionStatus } from "@prisma/client";

// =============================================================================
// POST /api/payables/[id]/transition — Change a payable's actionStatus
// =============================================================================
// Uses the new dual-status model. Transitions are keyed by actionStatus
// (null → "NULL"). The `to` field can be null (clear actionStatus, return to
// temporal) or an ActionStatus value.
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: { action?: string; paidAt?: string; targetStatus?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, paidAt, targetStatus } = body;

  if (!action) {
    return NextResponse.json({ error: "Campo 'action' é obrigatório" }, { status: 400 });
  }

  const payable = await prisma.payable.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });

  if (!payable) {
    return NextResponse.json({ error: "Título não encontrado" }, { status: 404 });
  }

  // Handle force-status (ADMIN-only override)
  const VALID_ACTION_STATUSES = new Set(["APPROVED", "HELD", "PAID", "PROTESTED", "CANCELLED"]);

  if (action === "force-status") {
    if (ctx.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Você não tem permissão para esta ação" },
        { status: 403 },
      );
    }

    // targetStatus can be an ActionStatus value or "NULL" to clear
    const newActionStatus: ActionStatus | null =
      targetStatus === "NULL" ? null : (targetStatus as ActionStatus);

    if (targetStatus !== "NULL" && (!targetStatus || !VALID_ACTION_STATUSES.has(targetStatus))) {
      return NextResponse.json(
        { error: "Status de destino inválido" },
        { status: 400 },
      );
    }

    // Check if already in that status
    if (payable.actionStatus === newActionStatus) {
      return NextResponse.json(
        { error: "O título já está neste status" },
        { status: 400 },
      );
    }

    if (newActionStatus === "PAID" && !paidAt) {
      return NextResponse.json(
        { error: "Data de pagamento é obrigatória para status Pago" },
        { status: 400 },
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      actionStatus: newActionStatus,
    };

    if (newActionStatus === "PAID") {
      updateData.paidAt = new Date(paidAt + "T12:00:00");
      updateData.markedPaidAt = new Date();
      if (!payable.approvedBy) {
        updateData.approvedBy = ctx.userId;
        updateData.approvedAt = new Date();
      }
    } else if (newActionStatus === "APPROVED") {
      updateData.approvedBy = ctx.userId;
      updateData.approvedAt = new Date();
      updateData.paidAt = null;
      updateData.markedPaidAt = null;
    } else if (newActionStatus === null) {
      // Clearing to temporal — reset downstream fields
      updateData.paidAt = null;
      updateData.markedPaidAt = null;
      updateData.approvedBy = null;
      updateData.approvedAt = null;
    } else {
      // HELD, PROTESTED, CANCELLED — clear payment fields
      updateData.paidAt = null;
      updateData.markedPaidAt = null;
    }

    try {
      const updated = await prisma.payable.update({
        where: { id },
        data: updateData,
        include: { supplier: { select: { name: true } } },
      });

      const ds = computeDisplayStatus(updated.actionStatus, updated.dueDate);

      return NextResponse.json({
        id: updated.id,
        actionStatus: updated.actionStatus,
        displayStatus: ds,
        supplierName: updated.supplier?.name ?? updated.payee ?? null,
        description: updated.description,
      });
    } catch (err) {
      console.error("[POST /api/payables/[id]/transition] force-status error:", err);
      const message =
        err instanceof Error ? err.message : "Erro interno do servidor";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Normal transition — look up in TRANSITIONS map
  const key = payable.actionStatus ?? "NULL";
  const ds = computeDisplayStatus(payable.actionStatus, payable.dueDate);
  const transitions = TRANSITIONS[key] ?? [];
  const transition = transitions.find((t) => {
    if (t.action !== action) return false;
    // Check display status requirement
    if (t.requiresDisplayStatus) {
      return t.requiresDisplayStatus.includes(ds);
    }
    return true;
  });

  if (!transition) {
    return NextResponse.json(
      { error: `Ação '${action}' não é válida para o status atual` },
      { status: 400 },
    );
  }

  if (!transition.requiredRoles.includes(ctx.role)) {
    return NextResponse.json(
      { error: "Você não tem permissão para esta ação" },
      { status: 403 },
    );
  }

  // Build update data
  const updateData: Record<string, unknown> = {
    actionStatus: transition.to as ActionStatus | null,
  };

  if (action === "approve") {
    updateData.approvedBy = ctx.userId;
    updateData.approvedAt = new Date();
  }

  if (action === "pay") {
    if (!paidAt) {
      return NextResponse.json(
        { error: "Data de pagamento é obrigatória" },
        { status: 400 },
      );
    }
    updateData.paidAt = new Date(paidAt + "T12:00:00");
    updateData.markedPaidAt = new Date();
  }

  if (action === "unapprove" || action === "release" || action === "reopen") {
    // Clear approval tracking when returning to temporal
    updateData.approvedBy = null;
    updateData.approvedAt = null;
  }

  if (action === "reverse") {
    // Full reset: clear payment AND approval fields
    updateData.paidAt = null;
    updateData.markedPaidAt = null;
    updateData.approvedBy = null;
    updateData.approvedAt = null;
  }

  try {
    const updated = await prisma.payable.update({
      where: { id },
      data: updateData,
      include: { supplier: { select: { name: true } } },
    });

    const newDs = computeDisplayStatus(updated.actionStatus, updated.dueDate);

    return NextResponse.json({
      id: updated.id,
      actionStatus: updated.actionStatus,
      displayStatus: newDs,
      supplierName: updated.supplier?.name ?? updated.payee ?? null,
      description: updated.description,
    });
  } catch (err) {
    console.error("[POST /api/payables/[id]/transition] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
