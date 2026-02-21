import { z } from "zod";

// =============================================================================
// CNPJ / CPF Validation Algorithms
// =============================================================================
// Brazilian tax documents (CNPJ for companies, CPF for individuals) have
// built-in "check digits" — the last 2 digits are calculated from the others
// using a weighted-sum algorithm. This means we can verify a document is
// mathematically valid without calling any external API.
// =============================================================================

/**
 * Remove all non-digit characters from a string.
 * "12.345.678/0001-90" → "12345678000190"
 */
export function stripDocument(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Format raw CNPJ digits into the standard Brazilian format.
 * "12345678000190" → "12.345.678/0001-90"
 */
export function formatCNPJ(raw: string): string {
  const digits = stripDocument(raw);
  if (digits.length !== 14) return raw;
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}

/**
 * Format raw CPF digits into the standard Brazilian format.
 * "12345678901" → "123.456.789-01"
 */
export function formatCPF(raw: string): string {
  const digits = stripDocument(raw);
  if (digits.length !== 11) return raw;
  return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

/**
 * Validate a CNPJ using the check digit algorithm.
 *
 * How it works:
 * 1. Take the first 12 digits
 * 2. Multiply each by a weight, sum them, mod by 11
 * 3. If remainder < 2, check digit = 0; otherwise check digit = 11 - remainder
 * 4. Repeat with 13 digits to verify the second check digit
 */
export function isValidCNPJ(raw: string): boolean {
  const digits = stripDocument(raw);
  if (digits.length !== 14) return false;

  // Reject known invalid patterns (all same digit)
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const calcCheckDigit = (slice: string, weights: number[]): number => {
    const sum = slice
      .split("")
      .reduce((acc, digit, i) => acc + Number(digit) * weights[i], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const firstCheck = calcCheckDigit(digits.slice(0, 12), weights1);
  if (firstCheck !== Number(digits[12])) return false;

  const secondCheck = calcCheckDigit(digits.slice(0, 13), weights2);
  if (secondCheck !== Number(digits[13])) return false;

  return true;
}

/**
 * Validate a CPF using the check digit algorithm.
 *
 * Same idea as CNPJ but with different weights:
 * - First check digit: weights [10, 9, 8, ..., 2]
 * - Second check digit: weights [11, 10, 9, ..., 2]
 */
export function isValidCPF(raw: string): boolean {
  const digits = stripDocument(raw);
  if (digits.length !== 11) return false;

  // Reject known invalid patterns (all same digit)
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcCheckDigit = (slice: string, factor: number): number => {
    const sum = slice
      .split("")
      .reduce((acc, digit, i) => acc + Number(digit) * (factor - i), 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const firstCheck = calcCheckDigit(digits.slice(0, 9), 10);
  if (firstCheck !== Number(digits[9])) return false;

  const secondCheck = calcCheckDigit(digits.slice(0, 10), 11);
  if (secondCheck !== Number(digits[10])) return false;

  return true;
}

// =============================================================================
// Zod Schema — Supplier Form
// =============================================================================
// This schema is used both client-side (react-hook-form) and server-side (API).
// The `superRefine` at the end does cross-field validation: the document field
// is validated using the correct algorithm based on the selected documentType.
// =============================================================================

export const supplierFormSchema = z
  .object({
    name: z
      .string()
      .min(1, "Nome é obrigatório")
      .max(200, "Nome deve ter no máximo 200 caracteres"),
    documentType: z.enum(["CNPJ", "CPF"], {
      error: "Tipo de documento é obrigatório",
    }),
    document: z.string().min(1, "Documento é obrigatório"),
    tradeName: z.string().max(200).optional().or(z.literal("")),
    contactName: z.string().max(200).optional().or(z.literal("")),
    email: z
      .string()
      .email("E-mail inválido")
      .optional()
      .or(z.literal("")),
    phone: z.string().max(20).optional().or(z.literal("")),
    bankName: z.string().max(100).optional().or(z.literal("")),
    bankAgency: z.string().max(20).optional().or(z.literal("")),
    bankAccount: z.string().max(30).optional().or(z.literal("")),
    pixKey: z.string().max(100).optional().or(z.literal("")),
    notes: z.string().max(500).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    const stripped = stripDocument(data.document);

    if (data.documentType === "CNPJ") {
      if (stripped.length !== 14) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CNPJ deve ter 14 dígitos",
          path: ["document"],
        });
      } else if (!isValidCNPJ(stripped)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CNPJ inválido",
          path: ["document"],
        });
      }
    } else if (data.documentType === "CPF") {
      if (stripped.length !== 11) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CPF deve ter 11 dígitos",
          path: ["document"],
        });
      } else if (!isValidCPF(stripped)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CPF inválido",
          path: ["document"],
        });
      }
    }
  });

export type SupplierFormData = z.infer<typeof supplierFormSchema>;
