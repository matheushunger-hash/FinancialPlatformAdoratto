// Shared types for the Supplier feature.
// Used by both the API routes (server) and the UI components (client).

export interface SupplierListItem {
  id: string;
  name: string;
  documentType: "CNPJ" | "CPF";
  document: string;
  tradeName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  bankName: string | null;
  bankAgency: string | null;
  bankAccount: string | null;
  pixKey: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierSummary {
  totalPaid: { value: number; count: number };
  openPayables: { value: number; count: number };
  overduePayables: { value: number; count: number };
}

export interface SupplierDetailResponse extends SupplierListItem {
  summary?: SupplierSummary;
}

export interface SuppliersListResponse {
  suppliers: SupplierListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
