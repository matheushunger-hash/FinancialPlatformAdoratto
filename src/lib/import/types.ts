// =============================================================================
// Types for the Spreadsheet Import feature (ADR-018)
// =============================================================================
// Shared between client-side wizard components and the server API route.
// The wizard collects a file, previews rows, maps columns, then sends
// the mapped data to the API for processing.
// =============================================================================

// --- Target fields that spreadsheet columns can map to ---

export const TARGET_FIELDS = [
  { key: "supplierName", label: "Fornecedor", required: true },
  { key: "document", label: "CNPJ/CPF", required: false },
  { key: "description", label: "Descrição", required: false },
  { key: "amount", label: "Valor Original", required: true },
  { key: "dueDate", label: "Data de Vencimento", required: true },
  { key: "issueDate", label: "Data de Emissão", required: false },
  { key: "payValue", label: "Valor a Pagar", required: false },
  { key: "category", label: "Categoria", required: false },
  { key: "paymentMethod", label: "Método de Pagamento", required: false },
  { key: "invoiceNumber", label: "Número NF-e", required: false },
  { key: "notes", label: "Observações", required: false },
  { key: "tags", label: "Tags", required: false },
] as const;

export type TargetFieldKey = (typeof TARGET_FIELDS)[number]["key"];

export const REQUIRED_FIELDS: TargetFieldKey[] = TARGET_FIELDS
  .filter((f) => f.required)
  .map((f) => f.key);

// --- Column mapping: spreadsheet header → target field ---

export interface ColumnMapping {
  sourceColumn: string; // Header name from spreadsheet
  targetField: TargetFieldKey | "ignore"; // Target field or "ignore"
}

// --- Default values for unmapped optional fields ---

export interface ImportDefaults {
  category: "REVENDA" | "DESPESA";
  paymentMethod: "BOLETO" | "PIX" | "TRANSFERENCIA" | "CARTAO" | "DINHEIRO" | "CHEQUE";
}

// --- Raw row: key-value pairs from the spreadsheet ---

export type RawRow = Record<string, unknown>;

// --- API request/response ---

export interface ImportRequest {
  rows: RawRow[];
  mapping: ColumnMapping[];
  defaults: ImportDefaults;
}

export interface ImportError {
  row: number; // 1-based row number (matches spreadsheet)
  reason: string;
}

export interface ImportResponse {
  created: number;
  suppliersCreated: number;
  errors: ImportError[];
}

// --- Wizard step enum ---

export type WizardStep = "upload" | "preview" | "mapping" | "processing" | "results";

export const WIZARD_STEPS: { key: WizardStep; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "preview", label: "Prévia" },
  { key: "mapping", label: "Mapeamento" },
  { key: "processing", label: "Processando" },
  { key: "results", label: "Resultados" },
];
