// Shared types for the Payable feature.
// Used by both the API routes (server) and the UI components (client).

import type { AttachmentItem } from "@/lib/attachments/types";
import type { DisplayStatus } from "./status";
export { DISPLAY_STATUS_CONFIG } from "./status";
export type { DisplayStatus } from "./status";

export interface PayableListItem {
  id: string;
  supplierId: string | null;
  supplierName: string | null; // Joined from supplier relation
  supplierDocument: string | null; // Raw digits from supplier
  supplierDocumentType: "CNPJ" | "CPF" | null; // For formatting
  payee: string | null; // Free-text payee name (when no formal supplier)
  description: string;
  category: "REVENDA" | "DESPESA";
  issueDate: string;
  dueDate: string;
  scheduledDate: string | null; // When payment is planned (mutable)
  amount: string; // Decimal serialized as string
  payValue: string;
  jurosMulta: string; // Decimal serialized as string (payValue - amount, min 0)
  daysOverdue: number | null; // Computed: days past due for unpaid overdue payables, null otherwise
  paymentMethod: string;
  invoiceNumber: string | null;
  notes: string | null;
  tags: string[];
  actionStatus: string | null; // Stored action status (null = no action taken)
  displayStatus: DisplayStatus; // Computed from actionStatus + dueDate
  source: string; // IMPORT | MANUAL | BANK_API
  createdAt: string;
  updatedAt: string;
}

// Filter options for narrowing down the payables list.
// Uses displayStatus instead of the old status enum.
export interface PayableFilters {
  displayStatus?: DisplayStatus;
  category?: "REVENDA" | "DESPESA";
  paymentMethod?:
    | "BOLETO"
    | "PIX"
    | "TRANSFERENCIA"
    | "CARTAO"
    | "DINHEIRO"
    | "CHEQUE"
    | "TAX_SLIP"
    | "PAYROLL";
  dueDateFrom?: string; // yyyy-MM-dd
  dueDateTo?: string; // yyyy-MM-dd
}

// Extended detail for the edit form — includes metadata not in the list response.
// Fetched by GET /api/payables/[id] when the user clicks "Editar".
export interface PayableDetail extends PayableListItem {
  approvedBy: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  markedPaidAt: string | null; // Server timestamp of when "pay" action was executed
  overdueTrackedAt: string | null; // Rolling tracking date for overdue re-imports (date-only)
  createdByName: string; // Looked up from the users table
  approvedByName: string | null; // Looked up from the users table (if approved)
  attachments: AttachmentItem[]; // Files attached to this payable (ADR-013)
}

// Editable when actionStatus is null (temporal) or APPROVED
export function isEditable(actionStatus: string | null): boolean {
  return actionStatus === null || actionStatus === "APPROVED";
}

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
  succeeded: { id: string; actionStatus: string | null }[];
  failed: { id: string; error: string }[];
}
