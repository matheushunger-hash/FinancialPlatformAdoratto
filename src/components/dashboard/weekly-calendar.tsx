"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DrillDownFilter, WeeklyPaymentData } from "@/lib/dashboard/types";

// -- Helpers --

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCompactBRL(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  }
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

// -- Color system --

// Paid segment — green (sits at the bottom of the stack)
const PAID_COLOR = "#22C55E";

// Overdue segment — always red (middle of the stack)
const OVERDUE_COLOR = "#EF4444";

// Budget heat map: pending bar color based on totalValue / limit
// Green → Amber → Orange → Red as the week approaches the limit
function getBudgetHeatColor(totalValue: number, limit: number): string {
  if (limit <= 0) return "#F59E0B";
  const utilization = totalValue / limit;
  if (utilization >= 0.95) return "#DC2626"; // Red — at/over limit
  if (utilization >= 0.80) return "#F97316"; // Orange — close to limit
  if (utilization >= 0.60) return "#F59E0B"; // Amber — attention
  return "#22C55E";                           // Green — safe
}

// Dark tooltip — same pattern as dashboard-charts.tsx
const TOOLTIP_CLASS =
  "rounded-lg border-0 bg-[#0A2540] px-3 py-2.5 text-sm text-white shadow-xl dark:border dark:bg-popover dark:text-popover-foreground";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomWeeklyTooltip({ active, payload, budgetLimit }: any) {
  if (!active || !payload?.[0]) return null;
  const week = payload[0].payload as WeeklyPaymentData;
  const utilPct = budgetLimit > 0 ? Math.round((week.totalValue / budgetLimit) * 100) : 0;
  return (
    <div className={TOOLTIP_CLASS}>
      <p className="font-semibold">{week.label}</p>
      <div className="flex items-baseline gap-2">
        <p className="tabular-nums">{formatBRL(week.totalValue)}</p>
        {budgetLimit > 0 && (
          <span className="text-xs opacity-70 tabular-nums">({utilPct}% do limite)</span>
        )}
      </div>
      <div className="mt-1 space-y-0.5 text-xs opacity-80">
        {week.paidValue > 0 && (
          <p className="text-emerald-300">
            {week.paidCount} pago{week.paidCount !== 1 ? "s" : ""} — {formatBRL(week.paidValue)}
          </p>
        )}
        <p>
          {week.count} pendente{week.count !== 1 ? "s" : ""} — {formatBRL(week.value)}
        </p>
        {week.overdueValue > 0 && (
          <p className="text-red-300">
            {week.overdueCount} vencido{week.overdueCount !== 1 ? "s" : ""} — {formatBRL(week.overdueValue)}
            {week.maxDaysOverdue > 0 && ` (até ${week.maxDaysOverdue}d)`}
          </p>
        )}
      </div>
    </div>
  );
}

export interface SelectedWeek {
  weekStart: string;
  weekEnd: string;
  label: string;
}

interface WeeklyCalendarProps {
  data: WeeklyPaymentData[] | null;
  loading: boolean;
  budgetLimit: number; // Weekly spending limit (e.g. R$ 350k) for heat map coloring
  onDrillDown: (filter: DrillDownFilter) => void;
  onWeekSelect?: (week: SelectedWeek) => void;
  selectedWeekLabel?: string; // Label of the currently selected week (for visual highlight)
  children?: React.ReactNode; // Rendered at the bottom of CardContent (e.g., WeekTopInvoices)
}

export function WeeklyCalendar({ data, loading, budgetLimit, onDrillDown, onWeekSelect, selectedWeekLabel, children }: WeeklyCalendarProps) {
  if (loading || !data) {
    return (
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-44" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasValues = data.some((w) => w.totalValue > 0);

  // Summary ribbon totals
  const totalPaid = data.reduce((s, w) => s + (w.paidValue ?? 0), 0);
  const totalPending = data.reduce((s, w) => s + w.value, 0);
  const totalOverdue = data.reduce((s, w) => s + w.overdueValue, 0);

  // Axis tick style — currentColor adapts to light/dark mode
  const tickStyle = { fill: "currentColor", fontSize: 12 };

  // Click handler for both bar segments — selects the week for the inline table
  function handleBarClick(_data: unknown) {
    const week = (_data as unknown as { payload: WeeklyPaymentData }).payload;
    if (!week) return;
    onWeekSelect?.({
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      label: week.label,
    });
  }

  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Vencimentos por Semana
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Summary ribbon */}
        {hasValues && (
          <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {totalPaid > 0 && (
              <>
                <span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatBRL(totalPaid)}
                  </span>{" "}
                  pago
                </span>
                <span>·</span>
              </>
            )}
            <span>
              <span className="font-semibold text-foreground tabular-nums">
                {formatBRL(totalPending)}
              </span>{" "}
              pendente
            </span>
            <span>·</span>
            <span>
              <span className="font-semibold text-red-500 tabular-nums">
                {formatBRL(totalOverdue)}
              </span>{" "}
              vencido
            </span>
            <span>·</span>
            <span>{data.length} semanas</span>
          </div>
        )}

        {!hasValues ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            Sem pagamentos pendentes ou vencidos nas próximas semanas.
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid
                  vertical={false}
                  className="stroke-border"
                  strokeOpacity={0.5}
                />
                <XAxis
                  dataKey="label"
                  tick={tickStyle}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={tickStyle}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatCompactBRL}
                />
                <Tooltip content={<CustomWeeklyTooltip budgetLimit={budgetLimit} />} />
                {/* Budget limit reference line */}
                {budgetLimit > 0 && (
                  <ReferenceLine
                    y={budgetLimit}
                    stroke="#94a3b8"
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                    label={{
                      value: `Limite ${formatCompactBRL(budgetLimit)}`,
                      position: "right",
                      fill: "#94a3b8",
                      fontSize: 11,
                    }}
                  />
                )}
                {/* Paid segment — bottom of stack, green */}
                <Bar
                  dataKey="paidValue"
                  stackId="week"
                  radius={[0, 0, 0, 0]}
                  cursor="pointer"
                  onClick={handleBarClick}
                >
                  {data.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={PAID_COLOR}
                      opacity={selectedWeekLabel && entry.label !== selectedWeekLabel ? 0.4 : 1}
                    />
                  ))}
                </Bar>
                {/* Overdue segment — middle of stack, always red */}
                <Bar
                  dataKey="overdueValue"
                  stackId="week"
                  radius={[0, 0, 0, 0]}
                  cursor="pointer"
                  onClick={handleBarClick}
                >
                  {data.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={OVERDUE_COLOR}
                      opacity={selectedWeekLabel && entry.label !== selectedWeekLabel ? 0.4 : 1}
                    />
                  ))}
                </Bar>
                {/* Pending segment — top of stack, heat map color by budget proximity */}
                <Bar
                  dataKey="value"
                  stackId="week"
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={handleBarClick}
                >
                  {data.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={getBudgetHeatColor(entry.totalValue, budgetLimit)}
                      opacity={selectedWeekLabel && entry.label !== selectedWeekLabel ? 0.4 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Custom legend */}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: PAID_COLOR }}
                />
                Pago
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: "#F59E0B" }}
                />
                Pendente
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: OVERDUE_COLOR }}
                />
                Vencido
              </span>
              <span className="flex items-center gap-1.5 opacity-60">
                <span className="inline-block h-0 w-4 border-t-2 border-dashed border-slate-400" />
                Limite
              </span>
            </div>
          </>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
