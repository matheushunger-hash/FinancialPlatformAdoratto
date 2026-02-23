import { z } from "zod";
import { parseCurrency } from "@/lib/payables/validation";

// =============================================================================
// Zod Schema — Recurring Payable Form
// =============================================================================
// Validates the create/edit form for recurring payment templates.
// Cross-field validations:
//   - amount must parse to a positive number
//   - frequency MONTHLY requires dayOfMonth (1–28)
//   - endDate (when provided) must be >= startDate
// =============================================================================

export const recurringFormSchema = z
  .object({
    supplierId: z.string().min(1, "Fornecedor é obrigatório"),
    description: z
      .string()
      .min(1, "Descrição é obrigatória")
      .max(200, "Descrição deve ter no máximo 200 caracteres"),
    category: z.enum(["REVENDA", "DESPESA"], {
      error: "Categoria é obrigatória",
    }),
    amount: z.string().min(1, "Valor é obrigatório"),
    paymentMethod: z.enum(
      ["BOLETO", "PIX", "TRANSFERENCIA", "CARTAO", "DINHEIRO", "CHEQUE"],
      { error: "Método de pagamento é obrigatório" },
    ),
    frequency: z.enum(["WEEKLY", "MONTHLY", "YEARLY"], {
      error: "Frequência é obrigatória",
    }),
    dayOfMonth: z.string().optional().or(z.literal("")),
    startDate: z.string().min(1, "Data de início é obrigatória"),
    endDate: z.string().optional().or(z.literal("")),
    tags: z.array(z.string()),
    notes: z.string().max(500).optional().or(z.literal("")),
    active: z.boolean().optional(), // Used by toggle, not by the form UI
  })
  .superRefine((data, ctx) => {
    // Validate that amount is a positive number
    const parsedAmount = parseCurrency(data.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Valor deve ser um número positivo",
        path: ["amount"],
      });
    }

    // MONTHLY frequency requires dayOfMonth (1–28)
    if (data.frequency === "MONTHLY") {
      const day = data.dayOfMonth ? parseInt(data.dayOfMonth, 10) : NaN;
      if (isNaN(day) || day < 1 || day > 28) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Dia do mês deve ser entre 1 e 28",
          path: ["dayOfMonth"],
        });
      }
    }

    // endDate must be >= startDate when provided
    if (data.startDate && data.endDate) {
      const start = new Date(data.startDate + "T12:00:00");
      const end = new Date(data.endDate + "T12:00:00");
      if (end < start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Data final não pode ser anterior à data de início",
          path: ["endDate"],
        });
      }
    }
  });

export type RecurringFormData = z.infer<typeof recurringFormSchema>;
