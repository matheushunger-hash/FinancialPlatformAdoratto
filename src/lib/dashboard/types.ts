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
  percentOfPlan?: number; // Only for "Pagos no Período" (0–100)
  delta?: number; // % change vs previous equivalent period (e.g., +12 or -5)
  sparkline?: number[]; // Daily values for sparkline mini-chart
}

export interface DashboardKPIs {
  totalPayable: KPICard; // Blue — status IN (PENDING, APPROVED)
  overdue: KPICard; // Red — due date passed, still pending/approved
  dueSoon: KPICard; // Amber — due within 7 days
  paidThisMonth: KPICard; // Green — paid in the selected period
  dueInPeriod: KPICard; // Purple — active payables due in the selected period
  insuredInPeriod: KPICard; // Teal — payables tagged "segurado" in the period
}

// =============================================================================
// Chart Data Types (ADR-015)
// =============================================================================

// One row per day in the stacked bar chart — each status has its R$ sum
export interface DailyPaymentData {
  date: string; // "2026-02-15" (ISO date — works across months)
  PENDING: number;
  APPROVED: number;
  PAID: number;
  OVERDUE: number;
  REJECTED: number;
  CANCELLED: number;
}

// One slice in the donut chart — count of payables per status
export interface StatusDistribution {
  status: string; // "PENDING", "APPROVED", etc.
  count: number;
}

// One bar in the top-10 horizontal bar chart
export interface TopSupplier {
  supplierId: string;
  supplierName: string;
  total: number; // Sum of payValue in R$
}

// Filter state for drill-down Sheet — built from chart click events
export interface DrillDownFilter {
  title: string; // Sheet header, e.g. "Pagamentos — 15/02 (Pendente)"
  supplierId?: string; // for supplier drill-down
  status?: string; // for stacked bar drill-down
  dueDateFrom: string; // ISO date "YYYY-MM-DD"
  dueDateTo: string; // ISO date "YYYY-MM-DD"
}

// Full API response — extends KPIs with chart data
export interface DashboardResponse extends DashboardKPIs {
  charts: {
    dailyPayments: DailyPaymentData[];
    statusDistribution: StatusDistribution[];
    topSuppliers: TopSupplier[];
  };
}
