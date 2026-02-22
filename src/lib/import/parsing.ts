// =============================================================================
// Parsing Utilities for Spreadsheet Import (ADR-018)
// =============================================================================
// Handles the messy reality of spreadsheet data: date formats, scientific
// notation numbers, masked documents, and smart column header matching.
//
// These functions run client-side (auto-mapping) and server-side (data parsing).
// =============================================================================

import type { ColumnMapping, TargetFieldKey } from "./types";

// =============================================================================
// Date Parsing
// =============================================================================
// Spreadsheets can store dates in multiple formats:
// 1. Excel serial numbers (days since 1900-01-01, with Lotus 1-2-3 bug)
// 2. "dd/mm/yyyy" strings (Brazilian standard)
// 3. "yyyy-mm-dd" strings (ISO format)
// 4. Date objects (from some parsers)
//
// Returns "yyyy-mm-dd" string or null if unparseable.
// =============================================================================

export function parseImportDate(value: unknown): string | null {
  if (value == null || value === "") return null;

  // Case 1: number → Excel serial date
  // Excel counts days from 1900-01-01, but has a known bug: it thinks 1900
  // was a leap year (inherited from Lotus 1-2-3). Day 60 = Feb 29 1900
  // (which doesn't exist). We subtract 1 for dates after day 60 to compensate.
  if (typeof value === "number") {
    if (value < 1 || value > 2958465) return null; // Reasonable date range
    const excelEpoch = new Date(1899, 11, 31); // Dec 31, 1899 (Excel serial 1 = Jan 1, 1900)
    const dayOffset = value > 60 ? value - 1 : value; // Lotus bug adjustment
    const date = new Date(excelEpoch.getTime() + dayOffset * 86400000);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // Case 2: string
  if (typeof value === "string") {
    const trimmed = value.trim();

    // "dd/mm/yyyy" — Brazilian format
    const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (brMatch) {
      const dd = brMatch[1].padStart(2, "0");
      const mm = brMatch[2].padStart(2, "0");
      const yyyy = brMatch[3];
      return `${yyyy}-${mm}-${dd}`;
    }

    // "yyyy-mm-dd" — ISO format (may have time portion)
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    return null;
  }

  // Case 3: Date object
  if (value instanceof Date && !isNaN(value.getTime())) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const dd = String(value.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

// =============================================================================
// Document Processing
// =============================================================================
// Adapted from scripts/import-suppliers.ts. Handles:
// - Scientific notation numbers (Excel stores CNPJs as floats)
// - Formatted strings with dots/slashes/dashes
// - Masked CPFs with asterisks
// - Empty/invalid values
//
// Returns { digits, documentType } where digits may be "" if no usable document.
// =============================================================================

export function processImportDocument(
  raw: unknown,
): { digits: string; documentType: "CNPJ" | "CPF" } {
  // Case: number (scientific notation from Excel)
  if (typeof raw === "number") {
    const asString = Math.round(raw).toString();
    const padded = asString.padStart(14, "0");
    return { digits: padded, documentType: "CNPJ" };
  }

  // Case: string
  if (typeof raw === "string") {
    const trimmed = raw.trim();

    // Masked or empty
    if (trimmed.includes("*") || trimmed === "" || trimmed === "-" || trimmed === ",") {
      return { digits: "", documentType: "CNPJ" };
    }

    // Strip formatting → digits only
    const digits = trimmed.replace(/\D/g, "");

    if (digits.length === 11) return { digits, documentType: "CPF" };
    if (digits.length === 14) return { digits, documentType: "CNPJ" };

    // Unexpected length → treat as no document
    if (digits.length === 0) return { digits: "", documentType: "CNPJ" };

    // Some digits but not 11 or 14 → unusable
    return { digits: "", documentType: "CNPJ" };
  }

  // null, undefined, or other types
  return { digits: "", documentType: "CNPJ" };
}

// =============================================================================
// Name Normalization
// =============================================================================

export function normalizeName(raw: string): string {
  return raw
    .trim()
    .replace(/[,;]+$/, "") // Remove trailing commas/semicolons
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .trim();
}

// =============================================================================
// Smart Column Auto-Mapping
// =============================================================================
// Matches spreadsheet column headers against regex patterns to pre-fill the
// mapping step. Users can override any mapping — this just saves time.
// =============================================================================

const HEADER_PATTERNS: { field: TargetFieldKey; patterns: RegExp[] }[] = [
  {
    field: "supplierName",
    patterns: [/fornecedor/i, /raz[aã]o\s*social/i, /nome/i, /empresa/i, /supplier/i],
  },
  {
    field: "document",
    patterns: [/cnpj/i, /cpf/i, /documento/i, /document/i],
  },
  {
    field: "description",
    patterns: [/descri[çc][aã]o/i, /hist[oó]rico/i, /description/i],
  },
  {
    field: "amount",
    patterns: [/valor\s*original/i, /valor/i, /amount/i, /total/i, /montante/i],
  },
  {
    field: "dueDate",
    patterns: [/vencimento/i, /data\s*venc/i, /due\s*date/i, /venc/i],
  },
  {
    field: "issueDate",
    patterns: [/emiss[aã]o/i, /entrada/i, /compet[eê]ncia/i, /issue\s*date/i],
  },
  {
    field: "payValue",
    patterns: [/valor\s*a?\s*pagar/i, /valor\s*pag/i, /pay\s*value/i],
  },
  {
    field: "category",
    patterns: [/categoria/i, /category/i, /tipo/i],
  },
  {
    field: "paymentMethod",
    patterns: [/m[eé]todo/i, /forma\s*de?\s*pagamento/i, /payment/i],
  },
  {
    field: "invoiceNumber",
    patterns: [/n[uú]mero\s*nf/i, /nota\s*fiscal/i, /nf-?e?/i, /invoice/i],
  },
  {
    field: "notes",
    patterns: [/observa[çc]/i, /notas?/i, /notes?/i, /obs/i],
  },
  {
    field: "tags",
    patterns: [/tags?/i, /etiquetas?/i, /labels?/i],
  },
  {
    field: "paidStatus",
    patterns: [/pago\??/i, /paid/i, /status.*pagamento/i, /já pago/i],
  },
];

/**
 * Auto-map spreadsheet headers to target fields using regex patterns.
 * Each target field can only be assigned once (first match wins).
 */
export function autoMapColumns(headers: string[]): ColumnMapping[] {
  const usedFields = new Set<string>();

  return headers.map((header) => {
    // Try each pattern group to find a match
    for (const { field, patterns } of HEADER_PATTERNS) {
      if (usedFields.has(field)) continue; // Already assigned

      for (const pattern of patterns) {
        if (pattern.test(header)) {
          usedFields.add(field);
          return { sourceColumn: header, targetField: field };
        }
      }
    }

    // No match — default to "ignore"
    return { sourceColumn: header, targetField: "ignore" as const };
  });
}
