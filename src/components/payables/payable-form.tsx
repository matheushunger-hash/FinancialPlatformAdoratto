"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  payableFormSchema,
  parseCurrency,
  type PayableFormData,
} from "@/lib/payables/validation";
import { SupplierCombobox } from "@/components/payables/supplier-combobox";
import type { PayableDetail } from "@/lib/payables/types";

// =============================================================================
// PayableForm — Create or edit a payable (título a pagar)
// =============================================================================
// Uses react-hook-form + Zod for validation, same pattern as SupplierForm.
// Supports two modes:
//   - Create (payable === null): empty form, POST to /api/payables
//   - Edit (payable !== null): pre-filled form, PATCH to /api/payables/[id]
//
// Form has 4 sections (+ metadata in edit mode):
//   0. Metadata (edit only): Criado por, Aprovado por, Pago em (read-only)
//   1. Dados Principais (supplier, description, category, invoice number)
//   2. Datas e Valores (dates, amounts, payment method)
//   3. Tags (toggle badges for fixed tag list)
//   4. Observações (notes)
//
// Key behaviors:
//   - In create mode: payValue auto-syncs with amount
//   - In edit mode: auto-sync is disabled (userEditedPayValue starts true)
//   - Supplier combobox is disabled in edit mode (can't change supplier)
//   - Currency inputs format on blur (Brazilian format: 1.234,56)
//   - Date pickers use pt-BR locale
// =============================================================================

// The fixed list of tags — these are business-specific labels
const AVAILABLE_TAGS = [
  { value: "protestado", label: "Protestado" },
  { value: "segurado", label: "Segurado" },
  { value: "renegociado", label: "Renegociado" },
  { value: "negativar", label: "Negativar" },
  { value: "duplicado", label: "Duplicado" },
  { value: "sem-boleto", label: "Sem Boleto" },
  { value: "sem-faturamento", label: "Sem Faturamento" },
];

// Payment method display labels (Portuguese)
const PAYMENT_METHODS = [
  { value: "BOLETO", label: "Boleto" },
  { value: "PIX", label: "PIX" },
  { value: "TRANSFERENCIA", label: "Transferência" },
  { value: "CARTAO", label: "Cartão" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "CHEQUE", label: "Cheque" },
];

// =============================================================================
// Currency formatting helpers
// =============================================================================
// Format a number to Brazilian currency format (without R$ symbol)
// 1234.56 → "1.234,56"

function formatCurrencyBR(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface PayableFormProps {
  payable: PayableDetail | null; // null = create mode, object = edit mode
  onSuccess: () => void;
}

export function PayableForm({ payable, onSuccess }: PayableFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const isEditing = payable !== null;

  // Track whether the user has manually edited payValue.
  // In create mode: starts false (auto-sync enabled).
  // In edit mode: starts true (skip auto-sync so existing value is preserved).
  const userEditedPayValue = useRef(isEditing);

  const form = useForm<PayableFormData>({
    resolver: zodResolver(payableFormSchema),
    defaultValues: isEditing
      ? {
          supplierId: payable.supplierId,
          description: payable.description,
          category: payable.category as "REVENDA" | "DESPESA",
          issueDate: payable.issueDate.split("T")[0],
          dueDate: payable.dueDate.split("T")[0],
          amount: formatCurrencyBR(Number(payable.amount)),
          payValue: formatCurrencyBR(Number(payable.payValue)),
          paymentMethod: payable.paymentMethod as PayableFormData["paymentMethod"],
          invoiceNumber: payable.invoiceNumber ?? "",
          notes: payable.notes ?? "",
          tags: payable.tags,
        }
      : {
          supplierId: "",
          description: "",
          category: undefined,
          issueDate: "",
          dueDate: "",
          amount: "",
          payValue: "",
          paymentMethod: undefined,
          invoiceNumber: "",
          notes: "",
          tags: [],
        },
  });

  // Auto-sync payValue when amount changes (if user hasn't manually edited it)
  const amountValue = form.watch("amount");
  useEffect(() => {
    if (!userEditedPayValue.current && amountValue) {
      form.setValue("payValue", amountValue);
    }
  }, [amountValue, form]);

  // Calculate juros/multa (interest/penalty) — the difference between payValue and amount
  const payValueStr = form.watch("payValue");
  const parsedAmount = parseCurrency(amountValue || "0");
  const parsedPayValue = parseCurrency(payValueStr || "0");
  const difference = parsedPayValue - parsedAmount;
  const showDifference =
    !isNaN(difference) && difference > 0 && parsedAmount > 0;

  // Format a currency input on blur — convert whatever the user typed
  // to the standard Brazilian format (1.234,56)
  function handleCurrencyBlur(fieldName: "amount" | "payValue") {
    const raw = form.getValues(fieldName);
    const parsed = parseCurrency(raw);
    if (!isNaN(parsed) && parsed > 0) {
      form.setValue(fieldName, formatCurrencyBR(parsed));
    }
  }

  async function onSubmit(data: PayableFormData) {
    setSubmitting(true);

    const url = isEditing ? `/api/payables/${payable.id}` : "/api/payables";
    const method = isEditing ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        let errorData: { error?: string } = {};
        try {
          errorData = await res.json();
        } catch {
          toast.error(`Erro do servidor (${res.status})`);
          return;
        }
        toast.error(
          errorData.error || (isEditing ? "Erro ao salvar alterações" : "Erro ao criar título"),
        );
        return;
      }

      toast.success(isEditing ? "Título atualizado com sucesso" : "Título criado com sucesso");
      onSuccess();
    } catch {
      toast.error(isEditing ? "Erro ao salvar alterações" : "Erro ao criar título");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6 px-4 pb-4"
      >
        {/* ============================================================= */}
        {/* Section 0: Metadata (edit mode only)                           */}
        {/* ============================================================= */}
        {isEditing && (
          <div className="rounded-md bg-muted p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Criado por</span>
              <span>{payable.createdByName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Criado em</span>
              <span>
                {format(new Date(payable.createdAt), "dd/MM/yyyy", {
                  locale: ptBR,
                })}
              </span>
            </div>
            {payable.approvedByName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Aprovado por</span>
                <span>{payable.approvedByName}</span>
              </div>
            )}
            {payable.approvedAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Aprovado em</span>
                <span>
                  {format(new Date(payable.approvedAt), "dd/MM/yyyy", {
                    locale: ptBR,
                  })}
                </span>
              </div>
            )}
            {payable.paidAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pago em</span>
                <span>
                  {format(new Date(payable.paidAt), "dd/MM/yyyy", {
                    locale: ptBR,
                  })}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ============================================================= */}
        {/* Section 1: Dados Principais                                    */}
        {/* ============================================================= */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-muted-foreground">
            Dados Principais
          </legend>

          {/* Supplier combobox */}
          <FormField
            control={form.control}
            name="supplierId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fornecedor</FormLabel>
                <FormControl>
                  <SupplierCombobox
                    value={field.value}
                    onChange={field.onChange}
                    disabled={isEditing}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Description */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Ex: Compra de mercadorias"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            {/* Category */}
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="REVENDA">Revenda</SelectItem>
                      <SelectItem value="DESPESA">Despesa</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Invoice number */}
            <FormField
              control={form.control}
              name="invoiceNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número NF-e</FormLabel>
                  <FormControl>
                    <Input placeholder="Opcional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </fieldset>

        {/* ============================================================= */}
        {/* Section 2: Datas e Valores                                     */}
        {/* ============================================================= */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-muted-foreground">
            Datas e Valores
          </legend>

          {/* Date pickers side by side */}
          <div className="grid grid-cols-2 gap-4">
            {/* Issue date */}
            <FormField
              control={form.control}
              name="issueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Entrada</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !field.value && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value
                            ? format(new Date(field.value + "T12:00:00"), "dd/MM/yyyy", {
                                locale: ptBR,
                              })
                            : "Selecionar"}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={
                          field.value ? new Date(field.value + "T12:00:00") : undefined
                        }
                        onSelect={(date) =>
                          field.onChange(
                            date ? format(date, "yyyy-MM-dd") : "",
                          )
                        }
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Due date */}
            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Vencimento</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !field.value && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value
                            ? format(new Date(field.value + "T12:00:00"), "dd/MM/yyyy", {
                                locale: ptBR,
                              })
                            : "Selecionar"}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={
                          field.value ? new Date(field.value + "T12:00:00") : undefined
                        }
                        onSelect={(date) =>
                          field.onChange(
                            date ? format(date, "yyyy-MM-dd") : "",
                          )
                        }
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Currency inputs side by side */}
          <div className="grid grid-cols-2 gap-4">
            {/* Amount (valor original) */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor Original</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="0,00"
                      inputMode="decimal"
                      {...field}
                      onBlur={() => {
                        field.onBlur();
                        handleCurrencyBlur("amount");
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Pay value (valor a pagar) */}
            <FormField
              control={form.control}
              name="payValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor a Pagar</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="0,00"
                      inputMode="decimal"
                      {...field}
                      onChange={(e) => {
                        // Once user manually types in payValue, stop auto-syncing
                        userEditedPayValue.current = true;
                        field.onChange(e);
                      }}
                      onBlur={() => {
                        field.onBlur();
                        handleCurrencyBlur("payValue");
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Juros/multa — auto-calculated, read-only */}
          {showDifference && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">Juros/Multa: </span>
              <span className="font-medium">
                R$ {formatCurrencyBR(difference)}
              </span>
            </div>
          )}

          {/* Payment method */}
          <FormField
            control={form.control}
            name="paymentMethod"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Método de Pagamento</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PAYMENT_METHODS.map((pm) => (
                      <SelectItem key={pm.value} value={pm.value}>
                        {pm.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        {/* ============================================================= */}
        {/* Section 3: Tags                                                */}
        {/* ============================================================= */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-muted-foreground">
            Tags
          </legend>

          <FormField
            control={form.control}
            name="tags"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_TAGS.map((tag) => {
                      const isSelected = field.value.includes(tag.value);
                      return (
                        <Badge
                          key={tag.value}
                          variant={isSelected ? "default" : "outline"}
                          className="cursor-pointer select-none"
                          onClick={() => {
                            // Toggle the tag: add if not selected, remove if selected
                            const next = isSelected
                              ? field.value.filter((t) => t !== tag.value)
                              : [...field.value, tag.value];
                            field.onChange(next);
                          }}
                        >
                          {tag.label}
                        </Badge>
                      );
                    })}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        {/* ============================================================= */}
        {/* Section 4: Observações                                         */}
        {/* ============================================================= */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-muted-foreground">
            Observações
          </legend>

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notas</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Observações adicionais sobre o título..."
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        {/* Submit button */}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? "Salvar Alterações" : "Criar Título"}
        </Button>
      </form>
    </Form>
  );
}
