import { z } from "zod";

// =============================================================================
// Currency Parsing — Brazilian format to number
// =============================================================================
// Brazilian currency uses dots for thousands and commas for decimals:
//   "1.234,56" → 1234.56
//   "100,00"   → 100
//   "1234.56"  → 1234.56 (also accept US format as fallback)
//
// The form displays values in pt-BR format, but we need plain numbers for
// Prisma's Decimal type. This function handles the conversion.
// =============================================================================

export function parseCurrency(value: string): number {
  const trimmed = value.trim();

  // If the string has both dots and commas, assume pt-BR format:
  // dots are thousands separators, comma is the decimal separator
  if (trimmed.includes(",") && trimmed.includes(".")) {
    // "1.234,56" → "1234.56"
    return Number(trimmed.replace(/\./g, "").replace(",", "."));
  }

  // If it only has a comma, that's the decimal separator
  // "1234,56" → "1234.56"
  if (trimmed.includes(",")) {
    return Number(trimmed.replace(",", "."));
  }

  // Otherwise treat as a plain number (already using dot for decimal)
  return Number(trimmed);
}

// =============================================================================
// Zod Schema — Payable Form
// =============================================================================
// All monetary values and dates come from the form as strings. The schema
// validates their format, and the API route converts them to proper types
// (Decimal, Date) before saving to the database.
//
// Cross-field validations (via superRefine):
//   - amount must parse to a positive number
//   - payValue must parse to a positive number
//   - dueDate must be >= issueDate
// =============================================================================

export const payableFormSchema = z
  .object({
    supplierId: z.string().optional().or(z.literal("")),
    payee: z.string().max(100, "Máximo 100 caracteres").optional().or(z.literal("")),
    description: z
      .string()
      .min(1, "Descrição é obrigatória")
      .max(200, "Descrição deve ter no máximo 200 caracteres"),
    category: z.enum(["REVENDA", "DESPESA"], {
      error: "Categoria é obrigatória",
    }),
    issueDate: z.string().min(1, "Data de entrada é obrigatória"),
    dueDate: z.string().min(1, "Data de vencimento é obrigatória"),
    amount: z.string().min(1, "Valor original é obrigatório"),
    payValue: z.string().min(1, "Valor a pagar é obrigatório"),
    paymentMethod: z.enum(
      ["BOLETO", "PIX", "TRANSFERENCIA", "CARTAO", "DINHEIRO", "CHEQUE"],
      { error: "Método de pagamento é obrigatório" },
    ),
    invoiceNumber: z.string().max(50).optional().or(z.literal("")),
    notes: z.string().max(500).optional().or(z.literal("")),
    tags: z.array(z.string()),
  })
  .superRefine((data, ctx) => {
    // Cross-field: at least one of supplierId or payee must be filled
    const hasSupplier = data.supplierId && data.supplierId.length > 0;
    const hasPayee = data.payee && data.payee.trim().length > 0;
    if (!hasSupplier && !hasPayee) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe um fornecedor ou beneficiário",
        path: ["supplierId"],
      });
    }

    // Validate that amount is a positive number
    const parsedAmount = parseCurrency(data.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Valor original deve ser um número positivo",
        path: ["amount"],
      });
    }

    // Validate that payValue is a positive number
    const parsedPayValue = parseCurrency(data.payValue);
    if (isNaN(parsedPayValue) || parsedPayValue <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Valor a pagar deve ser um número positivo",
        path: ["payValue"],
      });
    }

    // Validate that dueDate is not before issueDate
    if (data.issueDate && data.dueDate) {
      const issue = new Date(data.issueDate + "T12:00:00");
      const due = new Date(data.dueDate + "T12:00:00");
      if (due < issue) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Data de vencimento não pode ser anterior à data de entrada",
          path: ["dueDate"],
        });
      }
    }
  });

export type PayableFormData = z.infer<typeof payableFormSchema>;
