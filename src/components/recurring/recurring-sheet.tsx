"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SupplierCombobox } from "@/components/payables/supplier-combobox";
import { cn } from "@/lib/utils";
import { parseCurrency } from "@/lib/payables/validation";
import {
  recurringFormSchema,
  type RecurringFormData,
} from "@/lib/recurring/validation";
import type { RecurringDetail } from "@/lib/recurring/types";

// =============================================================================
// RecurringSheet — Slide-in form for create/edit recurring templates
// =============================================================================

const AVAILABLE_TAGS = [
  { value: "protestado", label: "Protestado" },
  { value: "segurado", label: "Segurado" },
  { value: "renegociado", label: "Renegociado" },
  { value: "negativar", label: "Negativar" },
  { value: "duplicado", label: "Duplicado" },
];

function formatCurrencyBR(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface RecurringSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: string | null;
  onSuccess: () => void;
}

export function RecurringSheet({
  open,
  onOpenChange,
  editingId,
  onSuccess,
}: RecurringSheetProps) {
  const isEditing = !!editingId;
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detail, setDetail] = useState<RecurringDetail | null>(null);

  // Fetch detail when editing
  useEffect(() => {
    if (!open || !editingId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);

    fetch(`/api/recurring/${editingId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Erro ao carregar recorrência");
        return res.json();
      })
      .then((data: RecurringDetail) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) toast.error("Erro ao carregar recorrência");
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, editingId]);

  // Show loading skeleton while fetching detail
  if (isEditing && loadingDetail) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Editar Recorrência</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Don't render form until we have data (edit) or immediately (create)
  if (isEditing && !detail) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Editar Recorrência" : "Nova Recorrência"}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Altere os dados do template recorrente."
              : "Cadastre um novo template de pagamento recorrente."}
          </SheetDescription>
        </SheetHeader>

        <RecurringForm
          key={editingId ?? "new"}
          detail={detail}
          editingId={editingId}
          onSuccess={onSuccess}
        />
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// RecurringForm — The actual form inside the Sheet
// =============================================================================

interface RecurringFormProps {
  detail: RecurringDetail | null;
  editingId: string | null;
  onSuccess: () => void;
}

function RecurringForm({ detail, editingId, onSuccess }: RecurringFormProps) {
  const isEditing = !!editingId;
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<RecurringFormData>({
    resolver: zodResolver(recurringFormSchema),
    defaultValues: detail
      ? {
          supplierId: detail.supplierId,
          description: detail.description,
          category: detail.category as "REVENDA" | "DESPESA",
          amount: formatCurrencyBR(Number(detail.amount)),
          paymentMethod: detail.paymentMethod as RecurringFormData["paymentMethod"],
          frequency: detail.frequency as "WEEKLY" | "MONTHLY" | "YEARLY",
          dayOfMonth: detail.dayOfMonth?.toString() ?? "",
          startDate: detail.startDate.split("T")[0],
          endDate: detail.endDate ? detail.endDate.split("T")[0] : "",
          tags: detail.tags,
          notes: detail.notes ?? "",
        }
      : {
          supplierId: "",
          description: "",
          category: undefined,
          amount: "",
          paymentMethod: undefined,
          frequency: undefined,
          dayOfMonth: "",
          startDate: "",
          endDate: "",
          tags: [],
          notes: "",
        },
  });

  const watchFrequency = form.watch("frequency");

  function handleCurrencyBlur() {
    const raw = form.getValues("amount");
    const parsed = parseCurrency(raw);
    if (!isNaN(parsed) && parsed > 0) {
      form.setValue("amount", formatCurrencyBR(parsed));
    }
  }

  async function onSubmit(data: RecurringFormData) {
    setSubmitting(true);
    try {
      const url = isEditing ? `/api/recurring/${editingId}` : "/api/recurring";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao salvar");
      }

      toast.success(
        isEditing ? "Recorrência atualizada" : "Recorrência criada",
      );
      onSuccess();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao salvar recorrência",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-6">
        {/* Section 1: Fornecedor */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-muted-foreground">
            Fornecedor
          </legend>

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
        </fieldset>

        {/* Section 2: Detalhes */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-muted-foreground">
            Detalhes
          </legend>

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl>
                  <Input placeholder="Ex: Aluguel Loja" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoria</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar..." />
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

            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Método de Pagamento</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="BOLETO">Boleto</SelectItem>
                      <SelectItem value="PIX">PIX</SelectItem>
                      <SelectItem value="TRANSFERENCIA">
                        Transferência
                      </SelectItem>
                      <SelectItem value="CARTAO">Cartão</SelectItem>
                      <SelectItem value="DINHEIRO">Dinheiro</SelectItem>
                      <SelectItem value="CHEQUE">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </fieldset>

        {/* Section 3: Recorrência */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-muted-foreground">
            Recorrência
          </legend>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="frequency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Frequência</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="WEEKLY">Semanal</SelectItem>
                      <SelectItem value="MONTHLY">Mensal</SelectItem>
                      <SelectItem value="YEARLY">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchFrequency === "MONTHLY" && (
              <FormField
                control={form.control}
                name="dayOfMonth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dia do Mês (1–28)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={28}
                        placeholder="10"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Start Date */}
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Início</FormLabel>
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
                            ? format(
                                new Date(field.value + "T12:00:00"),
                                "dd/MM/yyyy",
                              )
                            : "Selecionar data"}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={
                          field.value
                            ? new Date(field.value + "T12:00:00")
                            : undefined
                        }
                        onSelect={(date) => {
                          if (date) {
                            const yyyy = date.getFullYear();
                            const mm = String(date.getMonth() + 1).padStart(
                              2,
                              "0",
                            );
                            const dd = String(date.getDate()).padStart(2, "0");
                            field.onChange(`${yyyy}-${mm}-${dd}`);
                          }
                        }}
                        locale={ptBR}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* End Date (optional) */}
            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data Final (opcional)</FormLabel>
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
                            ? format(
                                new Date(field.value + "T12:00:00"),
                                "dd/MM/yyyy",
                              )
                            : "Sem data final"}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={
                          field.value
                            ? new Date(field.value + "T12:00:00")
                            : undefined
                        }
                        onSelect={(date) => {
                          if (date) {
                            const yyyy = date.getFullYear();
                            const mm = String(date.getMonth() + 1).padStart(
                              2,
                              "0",
                            );
                            const dd = String(date.getDate()).padStart(2, "0");
                            field.onChange(`${yyyy}-${mm}-${dd}`);
                          } else {
                            field.onChange("");
                          }
                        }}
                        locale={ptBR}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </fieldset>

        {/* Section 4: Valor */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-muted-foreground">
            Valor
          </legend>

          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valor (R$)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="0,00"
                    inputMode="decimal"
                    {...field}
                    onBlur={() => {
                      field.onBlur();
                      handleCurrencyBlur();
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        {/* Section 5: Tags */}
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
                          className="cursor-pointer"
                          onClick={() => {
                            if (isSelected) {
                              field.onChange(
                                field.value.filter(
                                  (t: string) => t !== tag.value,
                                ),
                              );
                            } else {
                              field.onChange([...field.value, tag.value]);
                            }
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

        {/* Section 6: Observações */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-muted-foreground">
            Observações
          </legend>

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea
                    placeholder="Observações adicionais..."
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        {/* Submit */}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? "Salvar Alterações" : "Criar Recorrência"}
        </Button>
      </form>
    </Form>
  );
}
