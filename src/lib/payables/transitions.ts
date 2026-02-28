// =============================================================================
// Status Transition Map — single source of truth for the payable workflow
// =============================================================================
// Every valid action is defined here: which actions are available from each
// actionStatus, what the target actionStatus is, and which roles can perform it.
// Both the API (validation) and the UI (menu items) read from this map.
//
// The key "NULL" represents records with no actionStatus (temporal statuses).
// A transition `to: null` means "clear actionStatus, return to temporal".
// =============================================================================

import type { DisplayStatus } from "./status";

export interface StatusTransition {
  action: string;
  label: string; // Portuguese label for button text
  to: string | null; // Target actionStatus (null = clear, return to temporal)
  requiredRoles: string[];
  /** If set, this action is only available for specific display statuses */
  requiresDisplayStatus?: DisplayStatus[];
}

export const TRANSITIONS: Record<string, StatusTransition[]> = {
  // No action taken — temporal status (A_VENCER, VENCE_HOJE, or VENCIDO)
  NULL: [
    {
      action: "approve",
      label: "Aprovar",
      to: "APPROVED",
      requiredRoles: ["ADMIN"],
    },
    {
      action: "hold",
      label: "Segurar",
      to: "HELD",
      requiredRoles: ["ADMIN"],
    },
    {
      action: "pay",
      label: "Registrar Pagamento",
      to: "PAID",
      requiredRoles: ["ADMIN", "USER"],
    },
    {
      action: "cancel",
      label: "Cancelar",
      to: "CANCELLED",
      requiredRoles: ["ADMIN"],
    },
    {
      action: "protest",
      label: "Protestar",
      to: "PROTESTED",
      requiredRoles: ["ADMIN"],
      requiresDisplayStatus: ["VENCIDO"],
    },
  ],
  APPROVED: [
    {
      action: "pay",
      label: "Registrar Pagamento",
      to: "PAID",
      requiredRoles: ["ADMIN", "USER"],
    },
    {
      action: "hold",
      label: "Segurar",
      to: "HELD",
      requiredRoles: ["ADMIN"],
    },
    {
      action: "unapprove",
      label: "Desaprovar",
      to: null,
      requiredRoles: ["ADMIN"],
    },
  ],
  HELD: [
    {
      action: "approve",
      label: "Aprovar",
      to: "APPROVED",
      requiredRoles: ["ADMIN"],
    },
    {
      action: "pay",
      label: "Registrar Pagamento",
      to: "PAID",
      requiredRoles: ["ADMIN", "USER"],
    },
    {
      action: "release",
      label: "Liberar",
      to: null,
      requiredRoles: ["ADMIN"],
    },
  ],
  PAID: [
    {
      action: "reverse",
      label: "Estornar Pagamento",
      to: null,
      requiredRoles: ["ADMIN"],
    },
    {
      action: "cancel",
      label: "Cancelar",
      to: "CANCELLED",
      requiredRoles: ["ADMIN"],
    },
  ],
  PROTESTED: [
    {
      action: "pay",
      label: "Registrar Pagamento",
      to: "PAID",
      requiredRoles: ["ADMIN", "USER"],
    },
  ],
  // CANCELLED is a terminal state — no normal transitions available.
  // Use force-status (ADMIN-only) for emergency corrections.
  CANCELLED: [],
};

/**
 * Returns only the transitions the current user can perform.
 * Uses the actionStatus key (null → "NULL") and optionally filters by displayStatus.
 */
export function getAvailableActions(
  actionStatus: string | null,
  userRole: string,
  displayStatus?: DisplayStatus,
): StatusTransition[] {
  const key = actionStatus ?? "NULL";
  const transitions = TRANSITIONS[key] ?? [];
  return transitions.filter((t) => {
    if (!t.requiredRoles.includes(userRole)) return false;
    // If the transition requires a specific display status, check it
    if (t.requiresDisplayStatus && displayStatus) {
      return t.requiresDisplayStatus.includes(displayStatus);
    }
    // If transition requires display status but we don't know it, hide it
    if (t.requiresDisplayStatus && !displayStatus) return false;
    return true;
  });
}
