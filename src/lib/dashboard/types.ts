// =============================================================================
// Dashboard KPI Types
// =============================================================================
// Shared between the API route (producer) and the KPICards component (consumer).
// Each KPICard represents one financial metric aggregated from payables.
// =============================================================================

export interface KPICard {
  label: string; // e.g. "Total a Pagar"
  value: number; // Sum in R$
  count: number; // Number of payables
  percentOfPlan?: number; // Only for "Pagos no Mês" (0–100)
}

export interface DashboardKPIs {
  totalPayable: KPICard; // Blue — status IN (PENDING, APPROVED)
  overdue: KPICard; // Red — due date passed, still pending/approved
  dueSoon: KPICard; // Amber — due within 7 days
  paidThisMonth: KPICard; // Green — paid in the selected month
}
