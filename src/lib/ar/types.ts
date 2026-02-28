// =============================================================================
// AR Module — Shared types for card transactions & reconciliation
// =============================================================================

// --- Parser types (used by importParser.ts) ---

export interface ParsedTransaction {
  transactionId: string; // Código
  brand: string; // Bandeira
  acquirer: string; // Autorizador
  modality: string; // Modalidade
  transactionDate: string; // "yyyy-MM-dd"
  expectedPaymentDate: string; // "yyyy-MM-dd"
  grossAmount: number;
  netAmount: number;
  feeAmount: number;
  feePct: number;
  nsu: string;
  unitCode: string; // Cod. Flex. Unid.
  unitName: string; // Nome da Unidade
  installment: number; // default 1
  totalInstallments: number; // default 1
  rowNumber: number; // for error reporting
}

export interface ParseError {
  row: number;
  reason: string;
}

export interface ParseMeta {
  totalRows: number; // accepted + rejected
  grossTotal: number;
  netTotal: number;
  dateFrom: string; // "yyyy-MM-dd" (earliest transactionDate)
  dateTo: string; // "yyyy-MM-dd" (latest transactionDate)
}

export interface ParseResult {
  accepted: ParsedTransaction[];
  rejected: ParseError[];
  meta: ParseMeta;
}

// --- API/UI types (used by future list/detail endpoints) ---

export interface CardTransactionListItem {
  id: string;
  transactionId: string;
  transactionDate: string; // ISO string
  expectedPaymentDate: string; // ISO string
  brand: string;
  acquirer: string;
  modality: string;
  grossAmount: string; // Decimal as string
  netAmount: string;
  feeAmount: string;
  feePct: string;
  nsu: string;
  unitCode: string;
  unitName: string;
  installment: number;
  totalInstallments: number;
  status: string; // TransactionStatus enum value
  createdAt: string;
  receipt: ReceiptSummary | null;
}

export interface ReceiptSummary {
  id: string;
  receivedAt: string; // yyyy-MM-dd
  receivedAmount: string; // Decimal as string
  divergence: string; // Decimal as string
  notes: string | null;
}

export interface TransactionsListResponse {
  transactions: CardTransactionListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  grossTotal: string; // Decimal as string — sum for current filter
  netTotal: string; // Decimal as string — sum for current filter
}

export interface ImportBatchSummary {
  id: string;
  filename: string;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  grossTotal: string; // Decimal as string
  netTotal: string;
  dateFrom: string;
  dateTo: string;
  importedAt: string;
}

export interface TransactionFilters {
  search?: string;
  status?: string;
  brand?: string;
  acquirer?: string;
  dateFrom?: string;
  dateTo?: string;
  importBatchId?: string;
}

// --- AR Dashboard types (#66) ---

export interface ARDashboardKPI {
  amount: string; // Decimal as string (R$)
  count: number;
}

export interface ARFeesKPI {
  amount: string; // Decimal as string (R$)
  avgPct: string; // Decimal as string (e.g., "4.09")
}

export interface UpcomingDay {
  date: string; // "yyyy-MM-dd"
  count: number; // transaction count
  netAmount: string; // Decimal as string
  topBrand: string; // most frequent brand that day
}

export interface ARDashboardSummary {
  totalPending: ARDashboardKPI; // All PENDING transactions
  receivableToday: ARDashboardKPI; // expectedPaymentDate = today, PENDING or CONFIRMED
  next7Days: ARDashboardKPI; // expectedPaymentDate in next 7 days, PENDING
  feesThisMonth: ARFeesKPI; // feeAmount sum + avg feePct for current calendar month
  overdueCount: number; // Count where status = OVERDUE
  weekOverWeekPct: string; // Formatted: "+3.2" or "-1.5" or "0"
  upcoming: UpcomingDay[]; // next 7 days, one entry per day with transactions
}

// --- Brand Cost Analysis types (#73) ---

export interface BrandCostRow {
  brand: string;
  transactionCount: number;
  grossTotal: string; // Decimal as string
  netTotal: string;
  feesTotal: string;
  avgFeePct: string; // e.g., "4.09"
  avgSettlementDays: number; // avg(expectedPaymentDate - transactionDate)
}

export interface BrandCostAnalysis {
  brands: BrandCostRow[];
  feesGrandTotal: string; // sum of all fees in period
  periodFrom: string;
  periodTo: string;
}

// --- Status config (like STATUS_CONFIG for PayableStatus) ---

export const TRANSACTION_STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  PENDING: { label: "Pendente", variant: "outline" },
  CONFIRMED: { label: "Confirmado", variant: "default" },
  DIVERGENT: { label: "Divergente", variant: "destructive" },
  OVERDUE: { label: "Vencido", variant: "destructive" },
  CANCELLED: { label: "Cancelado", variant: "secondary" },
};
