"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CalendarDay } from "@/lib/ar/types";

// =============================================================================
// ReceivableCalendar — 30-day horizontally scrollable timeline (#74)
// =============================================================================
// Shows expected deposits per day, color-coded by confirmation status.
// Hover reveals brand breakdown; click navigates to filtered transactions.
// =============================================================================

interface ReceivableCalendarProps {
  data: CalendarDay[] | null;
  loading: boolean;
  today: string; // "yyyy-MM-dd" — computed in orchestrator to avoid hydration mismatch
}

// --- Helpers ---

function formatBRL(value: string): string {
  const num = Number(value);
  if (isNaN(num)) return value;
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCompactBRL(value: string): string {
  const num = Number(value);
  if (isNaN(num)) return value;
  if (num >= 1_000_000) return `R$ ${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `R$ ${(num / 1_000).toFixed(1)}k`;
  return `R$ ${num.toFixed(0)}`;
}

type DayColor = "red" | "amber" | "green" | "gray";

function getDayColor(day: CalendarDay): DayColor {
  const overdue = Number(day.overdueAmount);
  const pending = Number(day.pendingAmount);
  const confirmed = Number(day.confirmedAmount);

  if (overdue > 0) return "red";
  if (pending > 0) return "amber";
  if (confirmed > 0) return "green";
  return "gray";
}

const COLOR_STYLES: Record<DayColor, string> = {
  red: "border-l-red-500 bg-red-500/5 dark:bg-red-500/10",
  amber: "border-l-amber-500 bg-amber-500/5 dark:bg-amber-500/10",
  green: "border-l-green-500 bg-green-500/5 dark:bg-green-500/10",
  gray: "border-l-muted-foreground/30 bg-muted/30",
};

// Build a lookup Map for O(1) access by date
function buildDayMap(days: CalendarDay[]): Map<string, CalendarDay> {
  const map = new Map<string, CalendarDay>();
  for (const day of days) {
    map.set(day.date, day);
  }
  return map;
}

// Generate all 30 date strings starting from `from`
function generateDateRange(from: string, count: number): string[] {
  const dates: string[] = [];
  const start = new Date(from + "T12:00:00"); // noon trick
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${day}`);
  }
  return dates;
}

// --- Empty day placeholder (no transactions) ---
const EMPTY_DAY: CalendarDay = {
  date: "",
  totalAmount: "0",
  pendingAmount: "0",
  confirmedAmount: "0",
  overdueAmount: "0",
  transactionCount: 0,
  byBrand: [],
};

// --- Component ---

export function ReceivableCalendar({ data, loading, today }: ReceivableCalendarProps) {
  const router = useRouter();

  function handleDayClick(dateStr: string) {
    router.push(`/dashboard/recebimentos/transacoes?from=${dateStr}&to=${dateStr}`);
  }

  // Generate all 30 days so we show empty days too
  const allDates = generateDateRange(today, 30);
  const dayMap = data ? buildDayMap(data) : new Map<string, CalendarDay>();

  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4" />
          Calendário de Recebimentos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Loading state */}
        {loading && (
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-28 shrink-0 rounded-lg" />
            ))}
          </div>
        )}

        {/* Empty state — data loaded but no transactions at all */}
        {!loading && data !== null && data.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum recebimento previsto nos próximos 30 dias.
          </p>
        )}

        {/* Calendar timeline */}
        {!loading && data !== null && (
          <div className="relative">
            {/* Scroll fade hint on right edge */}
            <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-8 bg-gradient-to-l from-card to-transparent" />

            <TooltipProvider>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {allDates.map((dateStr) => {
                  const day = dayMap.get(dateStr) ?? { ...EMPTY_DAY, date: dateStr };
                  const color = getDayColor(day);
                  const isToday = dateStr === today;
                  const hasData = day.transactionCount > 0;
                  const dateObj = new Date(dateStr + "T12:00:00");
                  const dayAbbr = format(dateObj, "EEE", { locale: ptBR });
                  const dayAbbrCap = dayAbbr.charAt(0).toUpperCase() + dayAbbr.slice(1);
                  const dateLabel = format(dateObj, "dd/MM");

                  return (
                    <Tooltip key={dateStr}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => handleDayClick(dateStr)}
                          className={`
                            flex w-28 shrink-0 cursor-pointer flex-col items-center
                            rounded-lg border-l-4 p-3 text-center
                            transition-all hover:shadow-md
                            ${COLOR_STYLES[color]}
                            ${isToday ? "ring-2 ring-primary ring-offset-1" : ""}
                          `}
                        >
                          {/* Date + day name */}
                          <span className="text-xs text-muted-foreground">
                            {dayAbbrCap}
                          </span>
                          <span className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>
                            {dateLabel}
                          </span>

                          {/* Amount */}
                          <span className="mt-1 text-sm font-medium tabular-nums">
                            {hasData ? formatCompactBRL(day.totalAmount) : "—"}
                          </span>

                          {/* Transaction count */}
                          <span className="text-[11px] text-muted-foreground">
                            {hasData
                              ? `${day.transactionCount} ${day.transactionCount === 1 ? "transação" : "transações"}`
                              : "Sem dados"}
                          </span>
                        </button>
                      </TooltipTrigger>

                      {/* Tooltip — brand breakdown */}
                      {hasData && (
                        <TooltipContent
                          side="bottom"
                          sideOffset={8}
                          className="max-w-xs p-3"
                        >
                          <p className="mb-2 text-xs font-semibold">
                            {format(dateObj, "dd/MM/yyyy (EEEE)", { locale: ptBR })}
                          </p>
                          <p className="mb-2 text-xs">
                            Total líquido: <strong>{formatBRL(day.totalAmount)}</strong>
                          </p>
                          {day.byBrand.length > 0 && (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-white/20">
                                  <th className="pb-1 text-left font-medium">Bandeira</th>
                                  <th className="pb-1 text-right font-medium">Valor</th>
                                  <th className="pb-1 text-right font-medium">Qtd</th>
                                </tr>
                              </thead>
                              <tbody>
                                {day.byBrand.slice(0, 5).map((b) => (
                                  <tr key={b.brand}>
                                    <td className="py-0.5 pr-3">{b.brand}</td>
                                    <td className="py-0.5 text-right tabular-nums">
                                      {formatCompactBRL(b.netAmount)}
                                    </td>
                                    <td className="py-0.5 text-right tabular-nums">
                                      {b.count}
                                    </td>
                                  </tr>
                                ))}
                                {day.byBrand.length > 5 && (
                                  <tr>
                                    <td
                                      colSpan={3}
                                      className="pt-1 text-center text-[10px] opacity-70"
                                    >
                                      +{day.byBrand.length - 5} mais
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          )}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          </div>
        )}

        {/* Color legend */}
        {!loading && data !== null && data.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
              Pendente
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-green-500" />
              Confirmado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
              Vencido
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
