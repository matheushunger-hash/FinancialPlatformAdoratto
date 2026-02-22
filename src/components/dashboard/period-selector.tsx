"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// =============================================================================
// PeriodSelector — Date range picker with presets for the dashboard
// =============================================================================
// Two date pickers (De / Até) + 4 quick-preset buttons. Follows the same
// Popover + Calendar pattern used in payables-filters.tsx.
// Stores dates as "YYYY-MM-DD" strings — the orchestrator passes them to the
// API as query params.
// =============================================================================

interface PeriodSelectorProps {
  from: string; // "2026-02-01"
  to: string; // "2026-02-28"
  onChange: (from: string, to: string) => void;
}

// Helper: format a Date to "YYYY-MM-DD"
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Each preset computes a from/to range relative to today
function getPresets() {
  const now = new Date();

  // This month: 1st → last day
  const thisMonthFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthTo = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Previous month: 1st → last day
  const prevMonthFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthTo = new Date(now.getFullYear(), now.getMonth(), 0);

  // Last 7 days: today - 6 → today
  const last7From = new Date(now);
  last7From.setDate(now.getDate() - 6);

  // Last 30 days: today - 29 → today
  const last30From = new Date(now);
  last30From.setDate(now.getDate() - 29);

  return [
    { key: "this-month", label: "Este Mês", from: toISODate(thisMonthFrom), to: toISODate(thisMonthTo) },
    { key: "prev-month", label: "Mês Anterior", from: toISODate(prevMonthFrom), to: toISODate(prevMonthTo) },
    { key: "last-7", label: "Últimos 7 dias", from: toISODate(last7From), to: toISODate(now) },
    { key: "last-30", label: "Últimos 30 dias", from: toISODate(last30From), to: toISODate(now) },
  ];
}

export function PeriodSelector({ from, to, onChange }: PeriodSelectorProps) {
  const presets = getPresets();

  // Determine which preset is active (if any) by comparing from/to strings
  const activePreset = presets.find((p) => p.from === from && p.to === to)?.key ?? null;

  function handleFromChange(date: Date | undefined) {
    if (!date) return;
    const newFrom = toISODate(date);
    // If new "from" is after current "to", auto-adjust "to" to match
    const newTo = newFrom > to ? newFrom : to;
    onChange(newFrom, newTo);
  }

  function handleToChange(date: Date | undefined) {
    if (!date) return;
    const newTo = toISODate(date);
    // If new "to" is before current "from", auto-adjust "from" to match
    const newFrom = newTo < from ? newTo : from;
    onChange(newFrom, newTo);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Preset badges */}
      {presets.map((preset) => (
        <Badge
          key={preset.key}
          variant={activePreset === preset.key ? "default" : "outline"}
          className="cursor-pointer select-none"
          onClick={() => onChange(preset.from, preset.to)}
        >
          {preset.label}
        </Badge>
      ))}

      {/* Date picker: De (from) */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-[150px] justify-start text-left font-normal",
              !from && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {format(new Date(from + "T12:00:00"), "dd/MM/yyyy", {
              locale: ptBR,
            })}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={new Date(from + "T12:00:00")}
            onSelect={handleFromChange}
            locale={ptBR}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      {/* Date picker: Até (to) */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-[150px] justify-start text-left font-normal",
              !to && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {format(new Date(to + "T12:00:00"), "dd/MM/yyyy", {
              locale: ptBR,
            })}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={new Date(to + "T12:00:00")}
            onSelect={handleToChange}
            locale={ptBR}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
