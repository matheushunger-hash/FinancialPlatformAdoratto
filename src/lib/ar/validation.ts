// =============================================================================
// AR Module — Zod schemas for forms and filters
// =============================================================================

import { z } from "zod";

// ---------------------------------------------------------------------------
// Receipt form — used when confirming payment for a card transaction
// ---------------------------------------------------------------------------
// receivedAt and receivedAmount are strings (same pattern as payable forms):
//   - receivedAt: "yyyy-MM-dd" date string
//   - receivedAmount: currency string, parsed to number in the API route
// Divergence (netAmount - receivedAmount) is computed server-side, not in the form.
// ---------------------------------------------------------------------------

export const receiptFormSchema = z.object({
  receivedAt: z.string().min(1, { message: "Data de recebimento obrigatória" }),
  receivedAmount: z.string().min(1, { message: "Valor recebido obrigatório" }),
  notes: z.string().optional().or(z.literal("")),
});

export type ReceiptFormData = z.infer<typeof receiptFormSchema>;

// ---------------------------------------------------------------------------
// Transaction filter — used by the transactions list page
// ---------------------------------------------------------------------------

export const transactionFilterSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  brand: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  importBatchId: z.string().optional(),
});

export type TransactionFilterData = z.infer<typeof transactionFilterSchema>;
