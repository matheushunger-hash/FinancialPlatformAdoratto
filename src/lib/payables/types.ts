// Shared types for the Payable feature.
// Used by both the API routes (server) and the UI components (client).

export interface PayableListItem {
  id: string;
  supplierId: string;
  supplierName: string; // Joined from supplier relation
  supplierDocument: string; // Raw digits from supplier
  supplierDocumentType: "CNPJ" | "CPF"; // For formatting
  description: string;
  category: "REVENDA" | "DESPESA";
  issueDate: string;
  dueDate: string;
  amount: string; // Decimal serialized as string
  payValue: string;
  paymentMethod: string;
  invoiceNumber: string | null;
  notes: string | null;
  tags: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

// Filter options for narrowing down the payables list.
// Each field is optional — undefined means "show all" for that dimension.
// Quick-filter pills set status OR tag (mutually exclusive).
// Advanced filters (category, paymentMethod, dates) are independent.
export interface PayableFilters {
  status?: "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";
  tag?: string;
  category?: "REVENDA" | "DESPESA";
  paymentMethod?:
    | "BOLETO"
    | "PIX"
    | "TRANSFERENCIA"
    | "CARTAO"
    | "DINHEIRO"
    | "CHEQUE";
  dueDateFrom?: string; // yyyy-MM-dd
  dueDateTo?: string; // yyyy-MM-dd
}

// Will be used by ADR-008 (table), defined now for the API response
export interface PayablesListResponse {
  payables: PayableListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
