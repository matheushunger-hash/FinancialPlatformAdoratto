// =============================================================================
// Display Status — computed from actionStatus + dueDate
// =============================================================================
// The dual-status model:
//   - actionStatus (stored): what a user DID (approved, held, paid, etc.)
//   - displayStatus (computed): what the UI SHOWS
//
// When actionStatus is null, the system derives a temporal status from dueDate:
//   dueDate > today  → A_VENCER (upcoming)
//   dueDate = today  → VENCE_HOJE (due today)
//   dueDate < today  → VENCIDO (overdue)
//
// When actionStatus has a value, displayStatus maps directly:
//   APPROVED → APROVADO, HELD → SEGURADO, PAID → PAGO, etc.
// =============================================================================

import type { ActionStatus } from "@prisma/client";

export type DisplayStatus =
  | "A_VENCER"
  | "VENCE_HOJE"
  | "VENCIDO"
  | "APROVADO"
  | "SEGURADO"
  | "PAGO"
  | "PROTESTADO"
  | "CANCELADO";

export interface DisplayStatusConfig {
  label: string;
  variant: "outline" | "default" | "destructive" | "secondary";
  color: string; // Hex color for charts/SVG
}

export const DISPLAY_STATUS_CONFIG: Record<DisplayStatus, DisplayStatusConfig> = {
  A_VENCER: { label: "A Vencer", variant: "outline", color: "#1E40AF" },
  VENCE_HOJE: { label: "Vence Hoje", variant: "outline", color: "#D97706" },
  VENCIDO: { label: "Vencido", variant: "destructive", color: "#DC2626" },
  APROVADO: { label: "Aprovado", variant: "default", color: "#3b82f6" },
  SEGURADO: { label: "Segurado", variant: "secondary", color: "#7C3AED" },
  PAGO: { label: "Pago", variant: "default", color: "#059669" },
  PROTESTADO: { label: "Protestado", variant: "destructive", color: "#991B1B" },
  CANCELADO: { label: "Cancelado", variant: "secondary", color: "#6B7280" },
};

// Map from stored ActionStatus to DisplayStatus (for non-null values)
const ACTION_TO_DISPLAY: Record<string, DisplayStatus> = {
  APPROVED: "APROVADO",
  HELD: "SEGURADO",
  PAID: "PAGO",
  PROTESTED: "PROTESTADO",
  CANCELLED: "CANCELADO",
};

/**
 * Computes the display status from the stored actionStatus and dueDate.
 * This is the core function of the dual-status model.
 *
 * @param actionStatus - The stored action status (null = no action taken)
 * @param dueDate - The original due date (as Date or ISO string)
 * @returns The computed display status for the UI
 */
export function computeDisplayStatus(
  actionStatus: ActionStatus | null,
  dueDate: Date | string,
): DisplayStatus {
  // If there's an action status, it takes precedence
  if (actionStatus !== null) {
    return ACTION_TO_DISPLAY[actionStatus] ?? "A_VENCER";
  }

  // No action → compute temporal status from dueDate vs today
  const dueDateStr =
    typeof dueDate === "string"
      ? dueDate.split("T")[0]
      : `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}-${String(dueDate.getDate()).padStart(2, "0")}`;

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  if (dueDateStr > todayStr) return "A_VENCER";
  if (dueDateStr === todayStr) return "VENCE_HOJE";
  return "VENCIDO";
}

/**
 * Translates a display status into a Prisma `where` clause.
 * Used by the list API when filtering by displayStatus.
 *
 * @param displayStatus - One or more display statuses to filter by
 * @param today - Today's date as yyyy-MM-dd string
 * @returns Prisma where conditions (to spread into the main where clause)
 */
export function buildWhereFromDisplayStatus(
  displayStatuses: DisplayStatus[],
  today: string,
): Record<string, unknown> {
  // Build OR conditions for each display status
  const conditions: Record<string, unknown>[] = [];

  for (const ds of displayStatuses) {
    switch (ds) {
      case "A_VENCER":
        conditions.push({
          actionStatus: null,
          dueDate: { gt: new Date(`${today}T23:59:59.999Z`) },
        });
        break;
      case "VENCE_HOJE":
        conditions.push({
          actionStatus: null,
          dueDate: {
            gte: new Date(`${today}T00:00:00.000Z`),
            lte: new Date(`${today}T23:59:59.999Z`),
          },
        });
        break;
      case "VENCIDO":
        conditions.push({
          actionStatus: null,
          dueDate: { lt: new Date(`${today}T00:00:00.000Z`) },
        });
        break;
      case "APROVADO":
        conditions.push({ actionStatus: "APPROVED" });
        break;
      case "SEGURADO":
        conditions.push({ actionStatus: "HELD" });
        break;
      case "PAGO":
        conditions.push({ actionStatus: "PAID" });
        break;
      case "PROTESTADO":
        conditions.push({ actionStatus: "PROTESTED" });
        break;
      case "CANCELADO":
        conditions.push({ actionStatus: "CANCELLED" });
        break;
    }
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { OR: conditions };
}
