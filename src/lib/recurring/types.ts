// =============================================================================
// Recurring Payable Types
// =============================================================================
// Shared between the API routes (producer) and the UI components (consumer).
// A recurring payable is a template that generates actual Payable records
// on a schedule (weekly, monthly, yearly).
// =============================================================================

export interface RecurringListItem {
  id: string;
  supplierId: string;
  supplierName: string;
  description: string;
  amount: string; // Decimal as string
  category: string;
  paymentMethod: string;
  frequency: string;
  dayOfMonth: number | null;
  startDate: string; // ISO date string
  endDate: string | null;
  active: boolean;
  lastGeneratedAt: string | null;
  tags: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringDetail extends RecurringListItem {
  createdByName: string;
}

export interface RecurringFilters {
  search?: string;
  active?: boolean;
  frequency?: string;
}

export interface RecurringListResponse {
  items: RecurringListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "Semanal",
  MONTHLY: "Mensal",
  YEARLY: "Anual",
};
