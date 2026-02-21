// Shared types for the Payable feature.
// Used by both the API routes (server) and the UI components (client).

export interface PayableListItem {
  id: string;
  supplierId: string;
  supplierName: string; // Joined from supplier relation
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

// Will be used by ADR-008 (table), defined now for the API response
export interface PayablesListResponse {
  payables: PayableListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
