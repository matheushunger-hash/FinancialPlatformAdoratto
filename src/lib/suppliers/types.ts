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

export interface SuppliersListResponse {
  suppliers: SupplierListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
