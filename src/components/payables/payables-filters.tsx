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
import type { DisplayStatus } from "@/lib/payables/status";

// =============================================================================
// PayablesFilters — Filter controls for the payables table
// =============================================================================
// Dumb presentational component: receives current filters + onChange callback
// from the orchestrator (payables-view.tsx). Two rows:
//   Row 1: Quick-filter pills (displayStatus) — mutually exclusive
//   Row 2: Advanced filters (category, payment method, date range, clear)
// =============================================================================

interface PayablesFiltersProps {
  filters: PayableFilters;
  onFiltersChange: (filters: PayableFilters) => void;
}

// Quick-filter pills: each one sets displayStatus.
// "Todos" clears displayStatus but keeps advanced filters (category, payment, dates).
const QUICK_FILTERS: { key: string; label: string; displayStatus?: DisplayStatus }[] = [
  { key: "all", label: "Todos" },
  { key: "VENCIDO", label: "Vencidos", displayStatus: "VENCIDO" },
  { key: "VENCE_HOJE", label: "Vence Hoje", displayStatus: "VENCE_HOJE" },
  { key: "A_VENCER", label: "A Vencer", displayStatus: "A_VENCER" },
  { key: "APROVADO", label: "Aprovados", displayStatus: "APROVADO" },
  { key: "PAGO", label: "Pagos", displayStatus: "PAGO" },
  { key: "SEGURADO", label: "Segurados", displayStatus: "SEGURADO" },
  { key: "PROTESTADO", label: "Protestados", displayStatus: "PROTESTADO" },
];

// Payment method labels for the dropdown (display-friendly names)
const PAYMENT_METHOD_OPTIONS = [
  { value: "BOLETO", label: "Boleto" },
  { value: "PIX", label: "PIX" },
  { value: "TRANSFERENCIA", label: "Transferência" },
  { value: "CARTAO", label: "Cartão" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "TAX_SLIP", label: "Guia Tributária" },
  { value: "PAYROLL", label: "Folha de Pagamento" },
];

export function PayablesFilters({
  filters,
  onFiltersChange,
}: PayablesFiltersProps) {
  // Determine which quick-filter pill is active
  function getActiveQuickFilter(): string {
    if (filters.displayStatus) return filters.displayStatus;
    if (!filters.displayStatus) return "all";
    return "";
  }

  const activeQuick = getActiveQuickFilter();

  // Check if any filter is active (for showing "Limpar" button)
  const hasAnyFilter =
    filters.displayStatus !== undefined ||
    filters.category !== undefined ||
    filters.paymentMethod !== undefined ||
    filters.dueDateFrom !== undefined ||
    filters.dueDateTo !== undefined;

  // --- Handlers ---

  function handleQuickFilter(displayStatus: DisplayStatus | undefined) {
    // Keep advanced filters, only replace displayStatus
    onFiltersChange({ ...filters, displayStatus });
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
            onClick={() => handleQuickFilter(qf.displayStatus)}
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
