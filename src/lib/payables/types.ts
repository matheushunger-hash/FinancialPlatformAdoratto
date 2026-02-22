// Shared types for the Payable feature.
// Used by both the API routes (server) and the UI components (client).

import type { AttachmentItem } from "@/lib/attachments/types";

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
  status?: "PENDING" | "APPROVED" | "REJECTED" | "PAID" | "OVERDUE" | "CANCELLED";
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

// Extended detail for the edit form — includes metadata not in the list response.
// Fetched by GET /api/payables/[id] when the user clicks "Editar".
export interface PayableDetail extends PayableListItem {
  approvedBy: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  createdByName: string; // Looked up from the users table
  approvedByName: string | null; // Looked up from the users table (if approved)
  attachments: AttachmentItem[]; // Files attached to this payable (ADR-013)
}

// Only these statuses allow editing — terminal statuses are locked.
export const EDITABLE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

// Will be used by ADR-008 (table), defined now for the API response
export interface PayablesListResponse {
  payables: PayableListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Response from the batch transition endpoint (ADR-011).
// Best-effort: each item either succeeds or fails independently.
export interface BatchTransitionResponse {
  succeeded: { id: string; status: string }[];
  failed: { id: string; error: string }[];
}
