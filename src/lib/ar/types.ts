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
  dateFrom?: string;
  dateTo?: string;
  importBatchId?: string;
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
