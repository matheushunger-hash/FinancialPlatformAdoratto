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
import type { TransactionFilters } from "@/lib/ar/types";

// =============================================================================
// TransactionsFilters — Filter controls for the AR transactions table
// =============================================================================
// Two rows: quick-filter pills (status) + advanced filters (brand, acquirer,
// date range). Same pattern as payables-filters.tsx.
// =============================================================================

interface TransactionsFiltersProps {
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
}

// Quick-filter pills — each one sets a status value.
// "Todos" clears status but keeps advanced filters.
const QUICK_FILTERS = [
  { key: "all", label: "Todos", status: undefined },
  { key: "pending", label: "Pendentes", status: "PENDING" as const },
  { key: "confirmed", label: "Confirmados", status: "CONFIRMED" as const },
  { key: "overdue", label: "Vencidos", status: "OVERDUE" as const },
  { key: "divergent", label: "Divergentes", status: "DIVERGENT" as const },
] as const;

// Common card brands for the dropdown
const BRAND_OPTIONS = [
  { value: "Visa", label: "Visa" },
  { value: "Mastercard", label: "Mastercard" },
  { value: "Elo", label: "Elo" },
  { value: "Hipercard", label: "Hipercard" },
  { value: "Amex", label: "Amex" },
];

// Common acquirers for the dropdown
const ACQUIRER_OPTIONS = [
  { value: "Cielo", label: "Cielo" },
  { value: "Stone", label: "Stone" },
  { value: "Rede", label: "Rede" },
  { value: "PagSeguro", label: "PagSeguro" },
  { value: "GetNet", label: "GetNet" },
];

export function TransactionsFilters({
  filters,
  onFiltersChange,
}: TransactionsFiltersProps) {
  // Determine which quick-filter pill is active
  function getActiveQuickFilter(): string {
    if (filters.status === "PENDING") return "pending";
    if (filters.status === "CONFIRMED") return "confirmed";
    if (filters.status === "OVERDUE") return "overdue";
    if (filters.status === "DIVERGENT") return "divergent";
    if (!filters.status) return "all";
    return "";
  }

  const activeQuick = getActiveQuickFilter();

  // Check if any filter is active (for showing "Limpar" button)
  const hasAnyFilter =
    filters.status !== undefined ||
    filters.brand !== undefined ||
    filters.acquirer !== undefined ||
    filters.dateFrom !== undefined ||
    filters.dateTo !== undefined;

  // --- Handlers ---

  function handleQuickFilter(status: string | undefined) {
    // Keep advanced filters, only replace status
    onFiltersChange({ ...filters, status });
  }

  function handleBrandChange(value: string) {
    onFiltersChange({
      ...filters,
      brand: value === "ALL" ? undefined : value,
    });
  }

  function handleAcquirerChange(value: string) {
    onFiltersChange({
      ...filters,
      acquirer: value === "ALL" ? undefined : value,
    });
  }

  function handleDateFromChange(date: Date | undefined) {
    onFiltersChange({
      ...filters,
      dateFrom: date ? format(date, "yyyy-MM-dd") : undefined,
    });
  }

  function handleDateToChange(date: Date | undefined) {
    onFiltersChange({
      ...filters,
      dateTo: date ? format(date, "yyyy-MM-dd") : undefined,
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
            onClick={() => handleQuickFilter(qf.status)}
          >
            {qf.label}
          </Badge>
        ))}
      </div>

      {/* Row 2: Advanced filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Brand */}
        <Select
          value={filters.brand ?? "ALL"}
          onValueChange={handleBrandChange}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Bandeira" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas</SelectItem>
            {BRAND_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Acquirer */}
        <Select
          value={filters.acquirer ?? "ALL"}
          onValueChange={handleAcquirerChange}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Adquirente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            {ACQUIRER_OPTIONS.map((opt) => (
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
                !filters.dateFrom && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {filters.dateFrom
                ? format(new Date(filters.dateFrom + "T12:00:00"), "dd/MM/yyyy", {
                    locale: ptBR,
                  })
                : "De"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={
                filters.dateFrom
                  ? new Date(filters.dateFrom + "T12:00:00")
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
                !filters.dateTo && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {filters.dateTo
                ? format(new Date(filters.dateTo + "T12:00:00"), "dd/MM/yyyy", {
                    locale: ptBR,
                  })
                : "Até"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={
                filters.dateTo
                  ? new Date(filters.dateTo + "T12:00:00")
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
