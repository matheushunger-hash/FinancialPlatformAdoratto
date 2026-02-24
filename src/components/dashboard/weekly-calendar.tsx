"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DrillDownFilter, UrgencyTier, WeeklyPaymentData } from "@/lib/dashboard/types";

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

// Overdue segment — always red (sits at the bottom of the stack)
const OVERDUE_COLOR = "#EF4444";

// Pending segment color varies by urgency tier (sits on top)
const PENDING_TIER_COLORS: Record<UrgencyTier, string> = {
  green: "#22C55E",  // All clear
  yellow: "#F59E0B", // Mild concern — amber
  orange: "#F97316", // Moderate — orange
  red: "#DC2626",    // Critical — deep red
};

// Dark tooltip — same pattern as dashboard-charts.tsx
const TOOLTIP_CLASS =
  "rounded-lg border-0 bg-[#0A2540] px-3 py-2.5 text-sm text-white shadow-xl dark:border dark:bg-popover dark:text-popover-foreground";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomWeeklyTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const week = payload[0].payload as WeeklyPaymentData;
  return (
    <div className={TOOLTIP_CLASS}>
      <p className="font-semibold">{week.label}</p>
      <p className="tabular-nums">{formatBRL(week.totalValue)}</p>
      <div className="mt-1 space-y-0.5 text-xs opacity-80">
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

interface WeeklyCalendarProps {
  data: WeeklyPaymentData[] | null;
  loading: boolean;
  onDrillDown: (filter: DrillDownFilter) => void;
}

export function WeeklyCalendar({ data, loading, onDrillDown }: WeeklyCalendarProps) {
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
  const totalPending = data.reduce((s, w) => s + w.value, 0);
  const totalOverdue = data.reduce((s, w) => s + w.overdueValue, 0);

  // Axis tick style — currentColor adapts to light/dark mode
  const tickStyle = { fill: "currentColor", fontSize: 12 };

  // Click handler for both bar segments — opens drill-down for the week
  function handleBarClick(_data: unknown) {
    const week = (_data as unknown as { payload: WeeklyPaymentData }).payload;
    if (!week) return;
    onDrillDown({
      title: `Semana ${week.label}`,
      dueDateFrom: week.weekStart,
      dueDateTo: week.weekEnd,
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
          <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
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
                <Tooltip content={<CustomWeeklyTooltip />} />
                {/* Overdue segment — bottom of stack, always red */}
                <Bar
                  dataKey="overdueValue"
                  stackId="week"
                  radius={[0, 0, 0, 0]}
                  fill={OVERDUE_COLOR}
                  cursor="pointer"
                  onClick={handleBarClick}
                />
                {/* Pending segment — top of stack, colored by urgency tier */}
                <Bar
                  dataKey="value"
                  stackId="week"
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={handleBarClick}
                >
                  {data.map((entry, i) => (
                    <Cell key={i} fill={PENDING_TIER_COLORS[entry.urgencyTier]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Custom legend */}
            <div className="mt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: "#22C55E" }}
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
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
