"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { receiptFormSchema, type ReceiptFormData } from "@/lib/ar/validation";

// =============================================================================
// ReceiptRegistrationDialog — Receipt form for AR transactions (#71)
// =============================================================================
// Captures receivedAt (date), receivedAmount (currency), and optional notes.
// Shows a live divergence preview comparing expected vs received amounts.
// Follows the same Dialog + react-hook-form pattern as payable-form.tsx.
// =============================================================================

interface ReceiptRegistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: {
    id: string;
    netAmount: string;
    expectedPaymentDate: string;
  } | null;
  onConfirm: (data: {
    transactionId: string;
    receivedAt: string;
    receivedAmount: string;
    notes: string;
  }) => void;
}

// Local currency parser for live divergence preview (same logic as API)
function parseAmount(value: string): number {
  const trimmed = value.trim().replace(/[R$\s]/g, "");
  if (trimmed.includes(",") && trimmed.includes(".")) {
    return Number(trimmed.replace(/\./g, "").replace(",", "."));
  }
  if (trimmed.includes(",")) {
    return Number(trimmed.replace(",", "."));
  }
  return Number(trimmed);
}

function formatBRL(value: string): string {
  const num = Number(value);
  if (isNaN(num)) return value;
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ReceiptRegistrationDialog({
  open,
  onOpenChange,
  transaction,
  onConfirm,
}: ReceiptRegistrationDialogProps) {
  const form = useForm<ReceiptFormData>({
    resolver: zodResolver(receiptFormSchema),
    defaultValues: {
      receivedAt: "",
      receivedAmount: "",
      notes: "",
    },
  });

  // Reset form when dialog opens with a new transaction
  useEffect(() => {
    if (open && transaction) {
      const dateStr = transaction.expectedPaymentDate.split("T")[0];
      form.reset({
        receivedAt: dateStr,
        receivedAmount: formatBRL(transaction.netAmount),
        notes: "",
      });
    }
  }, [open, transaction, form]);

  // Live divergence preview
  const watchedAmount = form.watch("receivedAmount");
  const divergence = useMemo(() => {
    if (!transaction) return null;
    const received = parseAmount(watchedAmount || "0");
    if (isNaN(received) || received <= 0) return null;
    const expected = Number(transaction.netAmount);
    return Math.round((expected - received) * 100) / 100;
  }, [watchedAmount, transaction]);

  // Date picker state derived from form value
  const selectedDate = form.watch("receivedAt");
  const dateValue = selectedDate
    ? new Date(selectedDate + "T12:00:00")
    : undefined;

  function handleDateSelect(date: Date | undefined) {
    if (date) {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const dd = String(date.getDate()).padStart(2, "0");
      form.setValue("receivedAt", `${yyyy}-${mm}-${dd}`, { shouldValidate: true });
    }
  }

  function handleSubmit(data: ReceiptFormData) {
    if (!transaction) return;
    onConfirm({
      transactionId: transaction.id,
      receivedAt: data.receivedAt,
      receivedAmount: data.receivedAmount,
      notes: data.notes || "",
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Recebimento</DialogTitle>
          <DialogDescription>
            Confirme os dados do depósito recebido.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {/* Expected amount (read-only) */}
          {transaction && (
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-sm text-muted-foreground">Valor esperado</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatBRL(transaction.netAmount)}
              </p>
            </div>
          )}

          {/* Date picker */}
          <div className="space-y-2">
            <Label>Data do Depósito</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateValue
                    ? format(dateValue, "dd/MM/yyyy", { locale: ptBR })
                    : "Selecione a data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateValue}
                  onSelect={handleDateSelect}
                  locale={ptBR}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {form.formState.errors.receivedAt && (
              <p className="text-sm text-destructive">
                {form.formState.errors.receivedAt.message}
              </p>
            )}
          </div>

          {/* Amount input */}
          <div className="space-y-2">
            <Label htmlFor="receivedAmount">Valor Recebido</Label>
            <Input
              id="receivedAmount"
              placeholder="R$ 0,00"
              {...form.register("receivedAmount")}
            />
            {form.formState.errors.receivedAmount && (
              <p className="text-sm text-destructive">
                {form.formState.errors.receivedAmount.message}
              </p>
            )}
          </div>

          {/* Live divergence preview */}
          {divergence !== null && (
            <div
              className={cn(
                "rounded-md p-3 text-sm font-medium",
                divergence === 0
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
              )}
            >
              {divergence === 0
                ? "Valores conferem"
                : `Divergência: ${formatBRL(String(Math.abs(divergence)))} ${divergence > 0 ? "(a menor)" : "(a maior)"}`}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Observação</Label>
            <Textarea
              id="notes"
              placeholder="Adicione uma observação..."
              rows={2}
              {...form.register("notes")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit">Confirmar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
