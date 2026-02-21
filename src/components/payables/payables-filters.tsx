"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import type { PayableFilters } from "@/lib/payables/types";

// =============================================================================
// PayablesFilters — Filter controls for the payables table
// =============================================================================
// Dumb presentational component: receives current filters + onChange callback
// from the orchestrator (payables-view.tsx). Two rows:
//   Row 1: Quick-filter pills (status / tag) — mutually exclusive
//   Row 2: Advanced filters (category, payment method, date range, clear)
// =============================================================================

interface PayablesFiltersProps {
  filters: PayableFilters;
  onFiltersChange: (filters: PayableFilters) => void;
}

// Quick-filter pills: each one sets status and/or tag.
// "Todos" clears both but keeps advanced filters (category, payment, dates).
const QUICK_FILTERS = [
  { key: "all", label: "Todos", status: undefined, tag: undefined },
  { key: "overdue", label: "Vencidos", status: "OVERDUE" as const, tag: undefined },
  { key: "pending", label: "Pendentes", status: "PENDING" as const, tag: undefined },
  { key: "paid", label: "Pagos", status: "PAID" as const, tag: undefined },
  { key: "protestado", label: "Protestados", status: undefined, tag: "protestado" },
] as const;

// Payment method labels for the dropdown (display-friendly names)
const PAYMENT_METHOD_OPTIONS = [
  { value: "BOLETO", label: "Boleto" },
  { value: "PIX", label: "PIX" },
  { value: "TRANSFERENCIA", label: "Transferência" },
  { value: "CARTAO", label: "Cartão" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "CHEQUE", label: "Cheque" },
  // TODO: split BOLETO into Itaú/Outros when bank field is added
];

export function PayablesFilters({
  filters,
  onFiltersChange,
}: PayablesFiltersProps) {
  // Determine which quick-filter pill is active
  function getActiveQuickFilter(): string {
    if (filters.tag === "protestado") return "protestado";
    if (filters.status === "OVERDUE") return "overdue";
    if (filters.status === "PENDING") return "pending";
    if (filters.status === "PAID") return "paid";
    if (!filters.status && !filters.tag) return "all";
    return "";
  }

  const activeQuick = getActiveQuickFilter();

  // Check if any filter is active (for showing "Limpar" button)
  const hasAnyFilter =
    filters.status !== undefined ||
    filters.tag !== undefined ||
    filters.category !== undefined ||
    filters.paymentMethod !== undefined ||
    filters.dueDateFrom !== undefined ||
    filters.dueDateTo !== undefined;

  // --- Handlers ---

  function handleQuickFilter(
    status: PayableFilters["status"],
    tag: string | undefined,
  ) {
    // Keep advanced filters, only replace status + tag
    onFiltersChange({ ...filters, status, tag });
  }

  function handleCategoryChange(value: string) {
    onFiltersChange({
      ...filters,
      category: value === "ALL" ? undefined : (value as PayableFilters["category"]),
    });
  }

  function handlePaymentMethodChange(value: string) {
    onFiltersChange({
      ...filters,
      paymentMethod:
        value === "ALL" ? undefined : (value as PayableFilters["paymentMethod"]),
    });
  }

  function handleDateFromChange(date: Date | undefined) {
    onFiltersChange({
      ...filters,
      dueDateFrom: date ? format(date, "yyyy-MM-dd") : undefined,
    });
  }

  function handleDateToChange(date: Date | undefined) {
    onFiltersChange({
      ...filters,
      dueDateTo: date ? format(date, "yyyy-MM-dd") : undefined,
    });
  }

  function handleClearAll() {
    onFiltersChange({});
  }

  return (
    <div className="space-y-3">
      {/* Row 1: Quick-filter pills */}
      <div className="flex flex-wrap gap-2">
        {QUICK_FILTERS.map((qf) => (
          <Badge
            key={qf.key}
            variant={activeQuick === qf.key ? "default" : "outline"}
            className="cursor-pointer select-none"
            onClick={() => handleQuickFilter(qf.status, qf.tag)}
          >
            {qf.label}
          </Badge>
        ))}
      </div>

      {/* Row 2: Advanced filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Category */}
        <Select
          value={filters.category ?? "ALL"}
          onValueChange={handleCategoryChange}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas</SelectItem>
            <SelectItem value="REVENDA">Revenda</SelectItem>
            <SelectItem value="DESPESA">Despesa</SelectItem>
          </SelectContent>
        </Select>

        {/* Payment Method */}
        <Select
          value={filters.paymentMethod ?? "ALL"}
          onValueChange={handlePaymentMethodChange}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Forma de Pagamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            {PAYMENT_METHOD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Date From */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[150px] justify-start text-left font-normal",
                !filters.dueDateFrom && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {filters.dueDateFrom
                ? format(new Date(filters.dueDateFrom + "T12:00:00"), "dd/MM/yyyy", {
                    locale: ptBR,
                  })
                : "De"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={
                filters.dueDateFrom
                  ? new Date(filters.dueDateFrom + "T12:00:00")
                  : undefined
              }
              onSelect={handleDateFromChange}
              locale={ptBR}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {/* Date To */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[150px] justify-start text-left font-normal",
                !filters.dueDateTo && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {filters.dueDateTo
                ? format(new Date(filters.dueDateTo + "T12:00:00"), "dd/MM/yyyy", {
                    locale: ptBR,
                  })
                : "Até"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={
                filters.dueDateTo
                  ? new Date(filters.dueDateTo + "T12:00:00")
                  : undefined
              }
              onSelect={handleDateToChange}
              locale={ptBR}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {/* Clear all filters */}
        {hasAnyFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="text-muted-foreground"
          >
            <X className="mr-1 h-4 w-4" />
            Limpar Filtros
          </Button>
        )}
      </div>
    </div>
  );
}
