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
  supplierId: string | null;
  supplierName: string;
  total: number; // Sum of payValue in R$
}

// Filter state for drill-down Sheet — built from chart click events
export interface DrillDownFilter {
  title: string; // Sheet header, e.g. "Pagamentos — 15/02 (Pendente)"
  supplierId?: string; // for supplier drill-down
  status?: string; // for stacked bar drill-down
  overdue?: boolean; // for aging bracket drill-down (PENDING/APPROVED + past due)
  tag?: string; // for tag-based drill-down (e.g., "segurado")
  dueDateFrom: string; // ISO date "YYYY-MM-DD"
  dueDateTo: string; // ISO date "YYYY-MM-DD"
}

// =============================================================================
// Aging Overview Types (#78)
// =============================================================================

// One bar in the aging bracket horizontal bar chart
export interface AgingBracket {
  label: string; // "0–30 dias", "31–60 dias", etc.
  key: string; // "0-30", "31-60", "61-90", "90+"
  min: number; // Lower bound in days (inclusive)
  max: number; // Upper bound in days (inclusive, Infinity for 90+)
  count: number;
  value: number; // Sum in R$
  color: string; // Hex color for the chart bar
}

// Summary of overdue payables aging — always-live (not period-filtered)
export interface AgingOverview {
  avgDaysOverdue: number; // Average aging across all overdue payables
  interestExposure: number; // Sum of jurosMulta on overdue payables
  criticalCount: number; // Count of payables 90+ days overdue
  agingBrackets: AgingBracket[];
}

// =============================================================================
// Buyer Budget Types (#84)
// =============================================================================

export interface BuyerBudgetData {
  totalOpen: number; // Sum of PENDING payable values due this week (R$)
  limit: number; // Configured weekly spending limit (R$)
  utilization: number; // totalOpen / limit (0.0 – 1.0+, can exceed 1.0)
  remaining: number; // limit - totalOpen (negative if over)
  status: "green" | "yellow" | "red";
  openCount: number; // Number of PENDING payables due this week
  weekLabel: string; // "21/02 – 27/02" (display label for current week)
}

// =============================================================================
// Weekly Calendar Types (#84)
// =============================================================================

export type UrgencyTier = "green" | "yellow" | "orange" | "red";

export interface WeeklyPaymentData {
  weekStart: string; // "2026-02-21" (ISO date, Saturday)
  weekEnd: string; // "2026-02-27" (ISO date, Friday)
  label: string; // "21/02 – 27/02" (display label)
  value: number; // Sum of non-overdue pending payValues in R$
  count: number; // Number of non-overdue pending payables
  isCurrent: boolean; // true for the week containing today
  overdueValue: number; // Sum of overdue payValues in this week
  overdueCount: number; // Count of overdue payables in this week
  totalValue: number; // value + overdueValue (convenience for tooltip/ribbon)
  totalCount: number; // count + overdueCount
  urgencyTier: UrgencyTier; // Color tier based on overdue ratio + max aging
  maxDaysOverdue: number; // Worst aging in this week (0 if no overdue)
}

// Full API response — extends KPIs with chart data + aging overview
export interface DashboardResponse extends DashboardKPIs {
  charts: {
    dailyPayments: DailyPaymentData[];
    statusDistribution: StatusDistribution[];
    topSuppliers: TopSupplier[];
  };
  agingOverview: AgingOverview;
  buyerBudget: BuyerBudgetData;
  weeklyCalendar: WeeklyPaymentData[];
}
