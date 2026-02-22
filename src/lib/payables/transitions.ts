// =============================================================================
// Status Transition Map — single source of truth for the payable workflow
// =============================================================================
// Every valid status change is defined here: which actions are available from
// each status, what the target status is, and which roles can perform it.
// Both the API (validation) and the UI (menu items) read from this map.
// =============================================================================

export interface StatusTransition {
  action: string; // "approve" | "reject" | "pay" | "reopen" | "reverse" | "cancel"
  label: string; // Portuguese label for button text
  to: string; // Target status
  requiredRoles: string[]; // Roles allowed to perform this action
}

export const TRANSITIONS: Record<string, StatusTransition[]> = {
  PENDING: [
    {
      action: "approve",
      label: "Aprovar",
      to: "APPROVED",
      requiredRoles: ["ADMIN"],
    },
    {
      action: "reject",
      label: "Rejeitar",
      to: "REJECTED",
      requiredRoles: ["ADMIN"],
    },
    {
      action: "pay",
      label: "Registrar Pagamento",
      to: "PAID",
      requiredRoles: ["ADMIN", "USER"],
    },
  ],
  APPROVED: [
    {
      action: "pay",
      label: "Registrar Pagamento",
      to: "PAID",
      requiredRoles: ["ADMIN", "USER"],
    },
  ],
  REJECTED: [
    {
      action: "reopen",
      label: "Reabrir",
      to: "PENDING",
      requiredRoles: ["ADMIN"],
    },
  ],
  PAID: [
    {
      action: "reverse",
      label: "Estornar Pagamento",
      to: "PENDING",
      requiredRoles: ["ADMIN"],
    },
    {
      action: "cancel",
      label: "Cancelar",
      to: "CANCELLED",
      requiredRoles: ["ADMIN"],
    },
  ],
  // OVERDUE, CANCELLED — terminal statuses, no outgoing transitions
};

/**
 * Returns only the transitions the current user can perform on a given status.
 * Used by the UI to show/hide menu items and by the API to validate requests.
 */
export function getAvailableActions(
  currentStatus: string,
  userRole: string,
): StatusTransition[] {
  const transitions = TRANSITIONS[currentStatus] ?? [];
  return transitions.filter((t) => t.requiredRoles.includes(userRole));
}
