// =============================================================================
// RPInfo Flex XLSX Parser
// =============================================================================
// Pure function: Buffer in → ParseResult out. No database dependencies.
//
// The RPInfo Flex "pending" file has a specific format:
//   - Header row at row 6 (0-indexed = 5)
//   - 44 columns, ~1,900 data rows per file
//   - Portuguese column names (Código, Bandeira, Valor Bruto, etc.)
//
// The parser validates each row, collects errors with spreadsheet row numbers,
// detects in-file duplicate Código values, and computes summary metadata.
// =============================================================================

import * as XLSX from "xlsx";
import { z } from "zod";
import { parseImportDate } from "@/lib/import/parsing";
import type { ParsedTransaction, ParseError, ParseResult } from "./types";

// RPInfo places headers at row 6 (0-indexed = 5)
const HEADER_ROW_INDEX = 5;

// ---------------------------------------------------------------------------
// Zod schema for raw row validation
// ---------------------------------------------------------------------------
// XLSX can give values as strings OR numbers depending on cell formatting,
// so most fields accept z.union([z.string(), z.number()]).
// Dates are z.unknown() because they go through parseImportDate separately.
// ---------------------------------------------------------------------------

const TransactionRowSchema = z.object({
  Código: z
    .union([z.string(), z.number()])
    .transform(String)
    .pipe(z.string().min(1, "Código obrigatório")),
  Bandeira: z.string().min(1, "Bandeira obrigatória"),
  Autorizador: z.string().min(1, "Autorizador obrigatório"),
  Modalidade: z.string().min(1, "Modalidade obrigatória"),
  Status: z.string().optional(),
  "Data Transação": z.unknown(),
  "Data Pagamento": z.unknown(),
  "Valor Bruto": z.union([z.string(), z.number()]),
  "Valor Liquido": z.union([z.string(), z.number()]),
  "Taxa Adm.": z.union([z.string(), z.number()]).optional(),
  "Taxa Adm": z.union([z.string(), z.number()]).optional(),
  "Perc. Taxa Adm.": z.union([z.string(), z.number()]).optional(),
  "Perc. Taxa Adm": z.union([z.string(), z.number()]).optional(),
  NSU: z
    .union([z.string(), z.number()])
    .transform(String),
  "Cod. Flex. Unid.": z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v != null ? String(v) : undefined)),
  "Cod. Flex. Unid": z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v != null ? String(v) : undefined)),
  "Nome da Unidade": z.string().optional(),
  Parcela: z.union([z.string(), z.number()]).optional(),
  "Total Parcelas": z.union([z.string(), z.number()]).optional(),
});

// ---------------------------------------------------------------------------
// parseNumber — handles both raw XLSX numbers and Brazilian-formatted strings
// ---------------------------------------------------------------------------

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    // Brazilian format: "1.234,56" → 1234.56
    if (trimmed.includes(",") && trimmed.includes(".")) {
      return Number(trimmed.replace(/\./g, "").replace(",", "."));
    }
    // Comma as decimal: "1234,56" → 1234.56
    if (trimmed.includes(",")) {
      return Number(trimmed.replace(",", "."));
    }
    // US/raw format: "1234.56"
    return Number(trimmed);
  }
  return null;
}

// ---------------------------------------------------------------------------
// parseImportFile — main entry point
// ---------------------------------------------------------------------------

export function parseImportFile(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Raw 2D array — each element is a row of cell values
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  // Extract headers from the expected row
  const headerRow = rawRows[HEADER_ROW_INDEX];
  if (!headerRow || !Array.isArray(headerRow)) {
    return {
      accepted: [],
      rejected: [{ row: HEADER_ROW_INDEX + 1, reason: "Cabeçalho não encontrado na linha 6" }],
      meta: { totalRows: 0, grossTotal: 0, netTotal: 0, dateFrom: "", dateTo: "" },
    };
  }

  const headers = headerRow.map((h) => (h != null ? String(h).trim() : ""));

  // Data rows start right after the header
  const dataRows = rawRows.slice(HEADER_ROW_INDEX + 1);

  const accepted: ParsedTransaction[] = [];
  const rejected: ParseError[] = [];
  const seenCodigos = new Set<string>();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    // Spreadsheet row number: header is at row 6 (1-based), data starts at row 7
    const spreadsheetRow = HEADER_ROW_INDEX + 2 + i;

    // Skip empty rows
    if (!row || !Array.isArray(row) || row.every((cell) => cell == null || cell === "")) {
      continue;
    }

    // Map headers to cell values → object
    const obj: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) {
        obj[headers[j]] = row[j] ?? null;
      }
    }

    // Validate with Zod
    const parsed = TransactionRowSchema.safeParse(obj);
    if (!parsed.success) {
      rejected.push({
        row: spreadsheetRow,
        reason: parsed.error.issues[0]?.message || "Erro de validação",
      });
      continue;
    }

    const data = parsed.data;

    // Parse dates
    const transactionDate = parseImportDate(data["Data Transação"]);
    const expectedPaymentDate = parseImportDate(data["Data Pagamento"]);

    if (!transactionDate) {
      rejected.push({ row: spreadsheetRow, reason: "Data Transação inválida" });
      continue;
    }
    if (!expectedPaymentDate) {
      rejected.push({ row: spreadsheetRow, reason: "Data Pagamento inválida" });
      continue;
    }

    // Parse amounts
    const grossAmount = parseNumber(data["Valor Bruto"]);
    const netAmount = parseNumber(data["Valor Liquido"]);
    // Handle column name variants (with/without trailing period)
    const feeAmount = parseNumber(data["Taxa Adm."] ?? data["Taxa Adm"]);
    const feePct = parseNumber(data["Perc. Taxa Adm."] ?? data["Perc. Taxa Adm"]);

    if (grossAmount == null || isNaN(grossAmount)) {
      rejected.push({ row: spreadsheetRow, reason: "Valor Bruto inválido" });
      continue;
    }
    if (netAmount == null || isNaN(netAmount)) {
      rejected.push({ row: spreadsheetRow, reason: "Valor Liquido inválido" });
      continue;
    }

    // Fee fields default to 0 if missing/invalid (some voucher rows may not have fees)
    const safeFeeAmount = feeAmount != null && !isNaN(feeAmount) ? feeAmount : 0;
    const safeFeePct = feePct != null && !isNaN(feePct) ? feePct : 0;

    // In-file duplicate detection
    const codigo = data.Código;
    if (seenCodigos.has(codigo)) {
      rejected.push({ row: spreadsheetRow, reason: `Código duplicado: ${codigo}` });
      continue;
    }
    seenCodigos.add(codigo);

    // Unit code/name — handle column name variants
    const unitCode = data["Cod. Flex. Unid."] ?? data["Cod. Flex. Unid"] ?? "";
    const unitName = data["Nome da Unidade"] ?? "";

    // Parse installment info
    const installment = Math.max(1, parseInt(String(data.Parcela ?? "1"), 10) || 1);
    const totalInstallments = Math.max(1, parseInt(String(data["Total Parcelas"] ?? "1"), 10) || 1);

    accepted.push({
      transactionId: codigo,
      brand: data.Bandeira,
      acquirer: data.Autorizador,
      modality: data.Modalidade,
      transactionDate,
      expectedPaymentDate,
      grossAmount,
      netAmount,
      feeAmount: safeFeeAmount,
      feePct: safeFeePct,
      nsu: data.NSU,
      unitCode,
      unitName,
      installment,
      totalInstallments,
      rowNumber: spreadsheetRow,
    });
  }

  // Compute metadata
  const meta = computeMeta(accepted, rejected.length);

  return { accepted, rejected, meta };
}

// ---------------------------------------------------------------------------
// computeMeta — summary statistics for the parsed file
// ---------------------------------------------------------------------------

function computeMeta(
  accepted: ParsedTransaction[],
  rejectedCount: number,
): ParseResult["meta"] {
  if (accepted.length === 0) {
    return {
      totalRows: rejectedCount,
      grossTotal: 0,
      netTotal: 0,
      dateFrom: "",
      dateTo: "",
    };
  }

  const grossTotal = accepted.reduce((sum, t) => sum + t.grossAmount, 0);
  const netTotal = accepted.reduce((sum, t) => sum + t.netAmount, 0);

  // Round to 2 decimal places to avoid floating-point drift
  const roundedGross = Math.round(grossTotal * 100) / 100;
  const roundedNet = Math.round(netTotal * 100) / 100;

  // Find earliest and latest transaction dates
  const dates = accepted.map((t) => t.transactionDate).sort();
  const dateFrom = dates[0];
  const dateTo = dates[dates.length - 1];

  return {
    totalRows: accepted.length + rejectedCount,
    grossTotal: roundedGross,
    netTotal: roundedNet,
    dateFrom,
    dateTo,
  };
}
