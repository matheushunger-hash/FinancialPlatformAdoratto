import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { TRANSITIONS } from "@/lib/payables/transitions";
import type { BatchTransitionResponse } from "@/lib/payables/types";

// =============================================================================
// POST /api/payables/batch-transition — Batch status transition (ADR-011)
// =============================================================================
// Processes multiple payable transitions in one request. Best-effort: each item
// is processed independently — partial success is OK (not all-or-nothing).
//
// Request body: { ids: string[], action: string, paidAt?: string }
// Response:     { succeeded: [...], failed: [...] }
// =============================================================================

// Known actions — used for early validation before looping
const VALID_ACTIONS = new Set(["approve", "reject", "pay", "reopen", "reverse", "cancel", "unapprove"]);

export async function POST(request: NextRequest) {
  // 1. Auth check
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse request body
  let body: { ids?: string[]; action?: string; paidAt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ids, action, paidAt } = body;

  // 3. Validate inputs
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

  // 4. Process each item — best-effort
  const succeeded: BatchTransitionResponse["succeeded"] = [];
  const failed: BatchTransitionResponse["failed"] = [];

  for (const id of ids) {
    try {
      // 4a. Fetch payable (scoped to tenant)
      const payable = await prisma.payable.findFirst({
        where: { id, tenantId: ctx.tenantId },
      });

      if (!payable) {
        failed.push({ id, error: "Título não encontrado" });
        continue;
      }

      // 4b. Check if the transition is valid for this payable's current status
      // Normalize to uppercase — pg driver adapter may return mixed-case enum values
      const status = payable.status.toUpperCase();
      const transitions = TRANSITIONS[status] ?? [];
      const transition = transitions.find((t) => t.action === action);

      if (!transition) {
        failed.push({
          id,
          error: `Ação '${action}' não válida para status '${payable.status}'`,
        });
        continue;
      }

      // 4c. Check role
      if (!transition.requiredRoles.includes(ctx.role)) {
        failed.push({ id, error: "Sem permissão para esta ação" });
        continue;
      }

      // 4d. Build update data (same logic as the single-transition route)
      const updateData: Record<string, unknown> = {
        status: transition.to,
      };

      if (action === "approve") {
        updateData.approvedBy = ctx.userId;
        updateData.approvedAt = new Date();
      }

      if (action === "pay") {
        updateData.paidAt = new Date(paidAt + "T12:00:00");
      }

      if (action === "reopen" || action === "unapprove") {
        updateData.approvedBy = null;
        updateData.approvedAt = null;
      }

      if (action === "reverse") {
        updateData.paidAt = null;
        updateData.approvedBy = null;
        updateData.approvedAt = null;
      }

      // "cancel" needs no extra fields — just the status change to CANCELLED

      // 4e. Apply the update
      await prisma.payable.update({
        where: { id },
        data: updateData,
      });

      succeeded.push({ id, status: transition.to });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro interno do servidor";
      failed.push({ id, error: message });
    }
  }

  return NextResponse.json({ succeeded, failed } satisfies BatchTransitionResponse);
}
