import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { TRANSITIONS } from "@/lib/payables/transitions";

// =============================================================================
// POST /api/payables/[id]/transition — Change a payable's status
// =============================================================================
// Single endpoint for all status transitions (approve, reject, pay, reopen).
// Validates the transition against the TRANSITIONS map and checks user role.
//
// Request body: { action: string, paidAt?: string, targetStatus?: string }
// - action: "approve" | "reject" | "pay" | "reopen" | "reverse" | "cancel" | "force-status"
// - paidAt: required when action is "pay" or when force-status targets "PAID" (yyyy-MM-dd format)
// - targetStatus: required when action is "force-status" (ADMIN-only override)
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. Auth check — getAuthContext() returns userId, tenantId, and role in one call
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Get payable ID from URL params (Next.js 16: params is a Promise)
  const { id } = await params;

  // 3. Parse request body
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

  // 4. Fetch current payable (scoped to tenant — everyone in org can see it)
  const payable = await prisma.payable.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });

  if (!payable) {
    return NextResponse.json({ error: "Título não encontrado" }, { status: 404 });
  }

  // 5. Handle force-status (ADMIN-only override — any status to any status)
  const VALID_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED", "PAID", "OVERDUE", "CANCELLED"]);

  if (action === "force-status") {
    if (ctx.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Você não tem permissão para esta ação" },
        { status: 403 },
      );
    }

    if (!targetStatus || !VALID_STATUSES.has(targetStatus)) {
      return NextResponse.json(
        { error: "Status de destino inválido" },
        { status: 400 },
      );
    }

    if (targetStatus === payable.status.toUpperCase()) {
      return NextResponse.json(
        { error: "O título já está neste status" },
        { status: 400 },
      );
    }

    if (targetStatus === "PAID" && !paidAt) {
      return NextResponse.json(
        { error: "Data de pagamento é obrigatória para status Pago" },
        { status: 400 },
      );
    }

    // Build update data with smart field cleanup
    const updateData: Record<string, unknown> = { status: targetStatus };

    if (targetStatus === "PAID") {
      updateData.paidAt = new Date(paidAt + "T12:00:00");
      // Keep existing approval if present, otherwise set current admin
      if (!payable.approvedBy) {
        updateData.approvedBy = ctx.userId;
        updateData.approvedAt = new Date();
      }
    } else if (targetStatus === "APPROVED") {
      updateData.approvedBy = ctx.userId;
      updateData.approvedAt = new Date();
      updateData.paidAt = null;
    } else {
      // PENDING, REJECTED, OVERDUE, CANCELLED — clear all downstream fields
      updateData.paidAt = null;
      updateData.approvedBy = null;
      updateData.approvedAt = null;
    }

    try {
      const updated = await prisma.payable.update({
        where: { id },
        data: updateData,
        include: { supplier: { select: { name: true } } },
      });

      return NextResponse.json({
        id: updated.id,
        status: updated.status,
        supplierName: updated.supplier.name,
        description: updated.description,
      });
    } catch (err) {
      console.error("[POST /api/payables/[id]/transition] force-status error:", err);
      const message =
        err instanceof Error ? err.message : "Erro interno do servidor";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // 6. Look up transition: is this action valid for the current status?
  // Normalize to uppercase — the pg driver adapter may return enum values
  // in database casing (e.g. "Paid") instead of Prisma schema casing ("PAID")
  const status = payable.status.toUpperCase();
  const transitions = TRANSITIONS[status] ?? [];
  const transition = transitions.find((t) => t.action === action);

  if (!transition) {
    return NextResponse.json(
      { error: `Ação '${action}' não é válida para o status '${payable.status}'` },
      { status: 400 },
    );
  }

  // 7. Validate role: does the user have permission for this action?
  if (!transition.requiredRoles.includes(ctx.role)) {
    return NextResponse.json(
      { error: "Você não tem permissão para esta ação" },
      { status: 403 },
    );
  }

  // 8. Build update data based on the action
  const updateData: Record<string, unknown> = {
    status: transition.to,
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
    // T12:00:00 trick — avoids timezone shift (ADR-008 lesson)
    updateData.paidAt = new Date(paidAt + "T12:00:00");
  }

  if (action === "reopen") {
    // Clear approval tracking when reopening
    updateData.approvedBy = null;
    updateData.approvedAt = null;
  }

  if (action === "reverse") {
    // Full reset: clear payment AND approval fields (back to PENDING)
    updateData.paidAt = null;
    updateData.approvedBy = null;
    updateData.approvedAt = null;
  }

  // "cancel" needs no extra fields — just the status change to CANCELLED

  try {
    const updated = await prisma.payable.update({
      where: { id },
      data: updateData,
      include: { supplier: { select: { name: true } } },
    });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      supplierName: updated.supplier.name,
      description: updated.description,
    });
  } catch (err) {
    console.error("[POST /api/payables/[id]/transition] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
