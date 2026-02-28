import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { TRANSITIONS } from "@/lib/payables/transitions";
import { computeDisplayStatus } from "@/lib/payables/status";
import type { BatchTransitionResponse } from "@/lib/payables/types";
import type { ActionStatus } from "@prisma/client";

// =============================================================================
// POST /api/payables/batch-transition — Batch actionStatus transition
// =============================================================================
// Best-effort: each item processed independently. Uses actionStatus-based
// transitions (null → "NULL" key).
// =============================================================================

const VALID_ACTIONS = new Set([
  "approve", "hold", "pay", "cancel", "protest",
  "unapprove", "release", "reverse",
]);

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { ids?: string[]; action?: string; paidAt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ids, action, paidAt } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: "Campo 'ids' deve ser um array não vazio" },
      { status: 400 },
    );
  }

  if (ids.length > 50) {
    return NextResponse.json(
      { error: "Máximo de 50 itens por requisição" },
      { status: 400 },
    );
  }

  if (!action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: `Ação '${action}' não é válida` },
      { status: 400 },
    );
  }

  if (action === "pay" && !paidAt) {
    return NextResponse.json(
      { error: "Data de pagamento é obrigatória para ação 'pay'" },
      { status: 400 },
    );
  }

  const succeeded: BatchTransitionResponse["succeeded"] = [];
  const failed: BatchTransitionResponse["failed"] = [];

  for (const id of ids) {
    try {
      const payable = await prisma.payable.findFirst({
        where: { id, tenantId: ctx.tenantId },
      });

      if (!payable) {
        failed.push({ id, error: "Título não encontrado" });
        continue;
      }

      // Look up transition by actionStatus key
      const key = payable.actionStatus ?? "NULL";
      const ds = computeDisplayStatus(payable.actionStatus, payable.dueDate);
      const transitions = TRANSITIONS[key] ?? [];
      const transition = transitions.find((t) => {
        if (t.action !== action) return false;
        if (t.requiresDisplayStatus) {
          return t.requiresDisplayStatus.includes(ds);
        }
        return true;
      });

      if (!transition) {
        failed.push({
          id,
          error: `Ação '${action}' não válida para o status atual`,
        });
        continue;
      }

      if (!transition.requiredRoles.includes(ctx.role)) {
        failed.push({ id, error: "Sem permissão para esta ação" });
        continue;
      }

      // Build update data
      const updateData: Record<string, unknown> = {
        actionStatus: transition.to as ActionStatus | null,
      };

      if (action === "approve") {
        updateData.approvedBy = ctx.userId;
        updateData.approvedAt = new Date();
      }

      if (action === "hold") {
        // No extra fields needed
      }

      if (action === "pay") {
        const paidDate = new Date(paidAt + "T12:00:00");
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        if (paidDate > endOfToday) {
          failed.push({ id, error: "Data de pagamento não pode ser no futuro" });
          continue;
        }
        updateData.paidAt = paidDate;
        updateData.markedPaidAt = new Date();
      }

      if (action === "unapprove" || action === "release" || action === "reopen") {
        updateData.approvedBy = null;
        updateData.approvedAt = null;
      }

      if (action === "reverse") {
        updateData.paidAt = null;
        updateData.markedPaidAt = null;
        updateData.approvedBy = null;
        updateData.approvedAt = null;
      }

      await prisma.payable.update({
        where: { id },
        data: updateData,
      });

      succeeded.push({ id, actionStatus: transition.to });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro interno do servidor";
      failed.push({ id, error: message });
    }
  }

  return NextResponse.json({ succeeded, failed } satisfies BatchTransitionResponse);
}
