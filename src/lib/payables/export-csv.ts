// =============================================================================
// CSV Export — Client-side download for selected payables (ADR-011)
// =============================================================================
// Generates a semicolon-delimited CSV (Brazilian Excel standard) with UTF-8 BOM
// so Excel correctly interprets accented characters (ã, ç, etc.).
// Triggered via Blob + temporary <a> element — no server endpoint needed.
// =============================================================================

import { formatCNPJ, formatCPF } from "@/lib/suppliers/validation";
import type { PayableListItem } from "@/lib/payables/types";

// --- Status label map (same as the table uses) ---
const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
  PAID: "Pago",
  OVERDUE: "Vencido",
  CANCELLED: "Cancelado",
};

// --- Tag label map ---
const TAG_LABELS: Record<string, string> = {
  protestado: "Protestado",
  segurado: "Segurado",
  renegociado: "Renegociado",
  negativar: "Negativar",
  duplicado: "Duplicado",
  "sem-boleto": "Sem Boleto",
  "sem-faturamento": "Sem Faturamento",
};

// --- Payment method label map ---
const METHOD_LABELS: Record<string, string> = {
  BOLETO: "Boleto",
  PIX: "PIX",
  TRANSFERENCIA: "Transferência",
  CARTAO: "Cartão",
  DINHEIRO: "Dinheiro",
  CHEQUE: "Cheque",
};

/**
 * Escape a CSV cell value — wraps in double-quotes if it contains semicolons,
 * quotes, or newlines. Inner double-quotes are doubled ("") per RFC 4180.
 */
function escapeCSV(value: string): string {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Format a date string (ISO or yyyy-MM-dd) into dd/MM/yyyy for display.
 * Uses T12:00:00 to avoid timezone shift (ADR-008 rule).
 */
function formatDateBR(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format a number string into Brazilian currency format (without R$ prefix).
 * "1234.56" → "1.234,56"
 */
function formatBRNumber(value: string): string {
  const num = Number(value);
  if (isNaN(num)) return value;
  return num.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Export selected payables as a CSV file download.
 * The data is already in memory (max 25 items per page), so this is instant.
 */
export function exportPayablesToCSV(payables: PayableListItem[]): void {
  const headers = [
    "Fornecedor",
    "CNPJ/CPF",
    "Descrição",
    "Categoria",
    "Vencimento",
    "Data Rastreamento",
    "Valor Original",
    "Valor a Pagar",
    "Status",
    "Tags",
    "Forma de Pagamento",
    "Nota Fiscal",
  ];

  const rows = payables.map((p) => [
    escapeCSV(p.supplierName ?? p.payee ?? ""),
    escapeCSV(
      p.supplierDocument && p.supplierDocumentType
        ? (p.supplierDocumentType === "CNPJ"
            ? formatCNPJ(p.supplierDocument)
            : formatCPF(p.supplierDocument))
        : "",
    ),
    escapeCSV(p.description),
    escapeCSV(p.category === "REVENDA" ? "Revenda" : "Despesa"),
    formatDateBR(p.dueDate),
    p.overdueTrackedAt ? formatDateBR(p.overdueTrackedAt) : "",
    formatBRNumber(p.amount),
    formatBRNumber(p.payValue),
    STATUS_LABELS[p.status] ?? p.status,
    escapeCSV(
      p.tags.map((t) => TAG_LABELS[t] ?? t).join(", "),
    ),
    METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod,
    escapeCSV(p.invoiceNumber ?? ""),
  ]);

  // Build CSV content: BOM + header + rows, semicolon-delimited
  const BOM = "\uFEFF";
  const csv =
    BOM +
    headers.join(";") +
    "\n" +
    rows.map((row) => row.join(";")).join("\n");

  // Trigger download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  // Filename: titulos-YYYY-MM-DD.csv
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  a.href = url;
  a.download = `titulos-${yyyy}-${mm}-${dd}.csv`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
