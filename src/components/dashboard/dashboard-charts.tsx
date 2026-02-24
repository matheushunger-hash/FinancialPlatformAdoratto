"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Label,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AgingBracket,
  DailyPaymentData,
  DrillDownFilter,
  StatusDistribution,
  TopSupplier,
  UrgencyTier,
} from "@/lib/dashboard/types";

// =============================================================================
// Dashboard Charts Component — Stripe/Linear aesthetic (#39)
// =============================================================================
// 3 Recharts charts: stacked bar (daily payments), donut with center label
// (status distribution), horizontal bar with background tracks (top suppliers).
// Dark navy tooltips in light mode, popover colors in dark mode.
// =============================================================================

// -- Status color map (updated for Stripe palette) --
const STATUS_COLORS: Record<string, string> = {
  PENDING: "#F59E0B", // amber
  APPROVED: "#635BFF", // purple (was blue)
  PAID: "#00D4AA", // teal (was green)
  OVERDUE: "#DF1B41", // red (updated)
  REJECTED: "#6b7280", // gray
  CANCELLED: "#9ca3af", // light gray
};

// Portuguese labels for the legend and tooltips
const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  PAID: "Pago",
  OVERDUE: "Vencido",
  REJECTED: "Rejeitado",
  CANCELLED: "Cancelado",
};

// Urgency-tier palette — same as weekly-calendar.tsx
const PENDING_TIER_COLORS: Record<UrgencyTier, string> = {
  green: "#22C55E",
  yellow: "#F59E0B",
  orange: "#F97316",
  red: "#DC2626",
};
const OVERDUE_COLOR = "#EF4444";
const PAID_COLOR = "#00D4AA"; // teal — matches PAID in STATUS_COLORS

const ALL_STATUSES = [
  "PENDING",
  "APPROVED",
  "PAID",
  "OVERDUE",
  "REJECTED",
  "CANCELLED",
] as const;

// -- Helpers --

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Compact format for Y-axis labels (e.g. 1.500 → "1,5k")
function formatCompactBRL(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  }
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

// Dark tooltip class string — dark navy in light mode, popover in dark mode
const TOOLTIP_CLASS =
  "rounded-lg border-0 bg-[#0A2540] px-3 py-2.5 text-sm text-white shadow-xl dark:border dark:bg-popover dark:text-popover-foreground";

// -- Custom Tooltips --

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

// Format "2026-02-15" → "15/02"
function formatDateLabel(isoDate: string): string {
  const parts = isoDate.split("-");
  return `${parts[2]}/${parts[1]}`;
}

function CustomBarTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  // Only show statuses that have a non-zero value
  const nonZero = payload.filter((p) => p.value > 0);
  if (nonZero.length === 0) return null;

  return (
    <div className={TOOLTIP_CLASS}>
      <p className="mb-1 font-medium">{label ? formatDateLabel(label) : ""}</p>
      {nonZero.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span>{STATUS_LABELS[entry.dataKey] ?? entry.dataKey}:</span>
          <span className="ml-auto tabular-nums">{formatBRL(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function CustomPieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { status: string } }[];
}) {
  if (!active || !payload?.length) return null;

  const entry = payload[0];
  return (
    <div className={TOOLTIP_CLASS}>
      <span>{STATUS_LABELS[entry.payload.status] ?? entry.name}: </span>
      <span className="font-medium">
        {entry.value} título{entry.value !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

function CustomSupplierTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: TopSupplier & { pendingAmount: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;
  return (
    <div className={TOOLTIP_CLASS}>
      <p className="mb-1 font-semibold">{s.supplierName}</p>
      <p className="tabular-nums">{formatBRL(s.total)}</p>
      <div className="mt-1 space-y-0.5 text-xs opacity-80">
        {s.paidTotal > 0 && (
          <p className="text-teal-300">Pago — {formatBRL(s.paidTotal)}</p>
        )}
        {s.pendingAmount > 0 && (
          <p>Pendente — {formatBRL(s.pendingAmount)}</p>
        )}
        {s.overdueTotal > 0 && (
          <p className="text-red-300">
            Vencido — {formatBRL(s.overdueTotal)}
            {s.maxDaysOverdue > 0 && ` (até ${s.maxDaysOverdue}d)`}
          </p>
        )}
      </div>
    </div>
  );
}

// -- Aging bracket tooltip --

function CustomAgingTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: AgingBracket }[];
}) {
  if (!active || !payload?.length) return null;
  const bracket = payload[0].payload;
  return (
    <div className={TOOLTIP_CLASS}>
      <p className="mb-1 font-medium">{bracket.label}</p>
      <p className="tabular-nums">{formatBRL(bracket.value)}</p>
      <p className="text-xs opacity-75">
        {bracket.count} título{bracket.count !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

// -- Empty state --

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

// -- Skeleton loading state --

function ChartSkeleton() {
  return (
    <div className="space-y-6">
      {/* Full-width chart skeleton */}
      <Card className="rounded-xl shadow-sm">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[350px] w-full" />
        </CardContent>
      </Card>
      {/* Two side-by-side chart skeletons */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <Skeleton className="h-5 w-44" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

interface DashboardChartsProps {
  charts: {
    dailyPayments: DailyPaymentData[];
    statusDistribution: StatusDistribution[];
    topSuppliers: TopSupplier[];
  } | null;
  agingBrackets?: AgingBracket[];
  loading: boolean;
  from?: string;
  to?: string;
  onDrillDown?: (filter: DrillDownFilter) => void;
}

export function DashboardCharts({ charts, agingBrackets, loading, from, to, onDrillDown }: DashboardChartsProps) {
  if (loading || !charts) {
    return <ChartSkeleton />;
  }

  // Axis tick style — uses currentColor so it adapts to light/dark mode
  const tickStyle = { fill: "currentColor", fontSize: 12 };

  // Total count for donut center label
  const donutTotal = charts.statusDistribution.reduce(
    (sum, s) => sum + s.count,
    0,
  );

  return (
    <div className="space-y-6">
      {/* Chart 1 — Stacked bar: daily payments by status (full width) */}
      <Card className="rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">
            Pagamentos por Dia
          </CardTitle>
        </CardHeader>
        <CardContent>
          {charts.dailyPayments.length === 0 ? (
            <EmptyChart message="Sem dados para este período." />
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={charts.dailyPayments}>
                <CartesianGrid
                  className="stroke-border"
                  strokeOpacity={0.5}
                />
                <XAxis
                  dataKey="date"
                  tick={tickStyle}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatDateLabel}
                />
                <YAxis
                  tick={tickStyle}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatCompactBRL}
                />
                <Tooltip content={<CustomBarTooltip />} />
                <Legend
                  formatter={(value: string) =>
                    STATUS_LABELS[value] ?? value
                  }
                />
                {ALL_STATUSES.map((status, index) => (
                  <Bar
                    key={status}
                    dataKey={status}
                    stackId="a"
                    fill={STATUS_COLORS[status]}
                    radius={
                      index === ALL_STATUSES.length - 1
                        ? [4, 4, 0, 0]
                        : undefined
                    }
                    cursor={onDrillDown ? "pointer" : undefined}
                    onClick={(_data, _index, event) => {
                      if (!onDrillDown) return;
                      const entry = (_data as unknown as { payload: DailyPaymentData }).payload ?? _data;
                      const date = (entry as DailyPaymentData).date;
                      if (!date) return;
                      onDrillDown({
                        title: `Pagamentos — ${formatDateLabel(date)}`,
                        dueDateFrom: date,
                        dueDateTo: date,
                      });
                    }}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Bottom row: donut (left) + top suppliers (right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Chart 2 — Donut: status distribution with center label */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              Distribuição por Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {charts.statusDistribution.length === 0 ? (
              <EmptyChart message="Sem dados para este período." />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={charts.statusDistribution}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                  >
                    {charts.statusDistribution.map((entry) => (
                      <Cell
                        key={entry.status}
                        fill={STATUS_COLORS[entry.status] ?? "#9ca3af"}
                      />
                    ))}
                    <Label
                      content={({ viewBox }) => {
                        if (
                          viewBox &&
                          "cx" in viewBox &&
                          "cy" in viewBox
                        ) {
                          return (
                            <text
                              x={viewBox.cx}
                              y={viewBox.cy}
                              textAnchor="middle"
                              dominantBaseline="middle"
                            >
                              <tspan
                                x={viewBox.cx}
                                dy="-0.5em"
                                className="fill-foreground text-2xl font-bold"
                              >
                                {donutTotal}
                              </tspan>
                              <tspan
                                x={viewBox.cx}
                                dy="1.5em"
                                className="fill-muted-foreground text-xs"
                              >
                                títulos
                              </tspan>
                            </text>
                          );
                        }
                      }}
                    />
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                  <Legend
                    formatter={(value: string) =>
                      STATUS_LABELS[value] ?? value
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Chart 3 — Horizontal stacked bar: top 10 suppliers (overdue + pending) */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              Top 10 Fornecedores por Valor
            </CardTitle>
          </CardHeader>
          <CardContent>
            {charts.topSuppliers.length === 0 ? (
              <EmptyChart message="Sem dados para este período." />
            ) : (
              (() => {
                const supplierData = charts.topSuppliers.map((s) => ({
                  ...s,
                  pendingAmount: Math.max(0, s.total - s.overdueTotal - s.paidTotal),
                }));
                const totalSum = supplierData.reduce((acc, d) => acc + d.total, 0);
                const overdueSum = supplierData.reduce((acc, d) => acc + d.overdueTotal, 0);
                const paidSum = supplierData.reduce((acc, d) => acc + d.paidTotal, 0);

                function handleSupplierClick(_data: unknown) {
                  if (!onDrillDown || !from || !to) return;
                  const entry = (_data as unknown as { payload: TopSupplier }).payload ?? _data;
                  const supplier = entry as TopSupplier;
                  if (!supplier.supplierId) return;
                  onDrillDown({
                    title: supplier.supplierName,
                    supplierId: supplier.supplierId,
                    dueDateFrom: from,
                    dueDateTo: to,
                  });
                }

                return (
                  <>
                    {/* Summary ribbon */}
                    <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-muted/50 px-4 py-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Total: </span>
                        <span className="font-semibold tabular-nums">{formatBRL(totalSum)}</span>
                      </div>
                      {paidSum > 0 && (
                        <div>
                          <span className="text-muted-foreground">Pago: </span>
                          <span className="font-semibold tabular-nums text-teal-600 dark:text-teal-400">
                            {formatBRL(paidSum)}
                          </span>
                        </div>
                      )}
                      {overdueSum > 0 && (
                        <div>
                          <span className="text-muted-foreground">Vencido: </span>
                          <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">
                            {formatBRL(overdueSum)}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">{supplierData.length} fornecedores</span>
                      </div>
                    </div>

                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={supplierData}
                        layout="vertical"
                        margin={{ left: 60 }}
                      >
                        <CartesianGrid
                          className="stroke-border"
                          strokeOpacity={0.5}
                          horizontal={false}
                        />
                        <XAxis
                          type="number"
                          tick={tickStyle}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={formatCompactBRL}
                        />
                        <YAxis
                          type="category"
                          dataKey="supplierName"
                          tick={tickStyle}
                          tickLine={false}
                          axisLine={false}
                          width={200}
                        />
                        <Tooltip content={<CustomSupplierTooltip />} />
                        {/* Paid segment — bottom of stack, teal */}
                        <Bar
                          dataKey="paidTotal"
                          stackId="supplier"
                          radius={[0, 0, 0, 0]}
                          fill={PAID_COLOR}
                          cursor={onDrillDown ? "pointer" : undefined}
                          onClick={handleSupplierClick}
                        />
                        {/* Pending segment — middle, colored by urgency tier */}
                        <Bar
                          dataKey="pendingAmount"
                          stackId="supplier"
                          radius={[0, 0, 0, 0]}
                          cursor={onDrillDown ? "pointer" : undefined}
                          onClick={handleSupplierClick}
                        >
                          {supplierData.map((entry, i) => (
                            <Cell key={i} fill={PENDING_TIER_COLORS[entry.urgencyTier]} />
                          ))}
                        </Bar>
                        {/* Overdue segment — top of stack, red (most visible) */}
                        <Bar
                          dataKey="overdueTotal"
                          stackId="supplier"
                          radius={[0, 4, 4, 0]}
                          fill={OVERDUE_COLOR}
                          cursor={onDrillDown ? "pointer" : undefined}
                          onClick={handleSupplierClick}
                        />
                      </BarChart>
                    </ResponsiveContainer>

                    {/* Custom legend */}
                    <div className="mt-3 flex items-center justify-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PAID_COLOR }} />
                        Pago
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#22C55E" }} />
                        Pendente
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: OVERDUE_COLOR }} />
                        Vencido
                      </span>
                    </div>
                  </>
                );
              })()
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chart 4 — Horizontal bar: aging brackets for overdue payables (#78) */}
      {agingBrackets && agingBrackets.length > 0 && (
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              Aging dos Títulos Vencidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {agingBrackets.every((b) => b.count === 0) ? (
              <EmptyChart message="Nenhum título vencido no momento." />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={agingBrackets}
                  layout="vertical"
                  margin={{ left: 20 }}
                >
                  <CartesianGrid
                    className="stroke-border"
                    strokeOpacity={0.5}
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={tickStyle}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatCompactBRL}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={tickStyle}
                    tickLine={false}
                    axisLine={false}
                    width={100}
                  />
                  <Tooltip content={<CustomAgingTooltip />} />
                  <Bar
                    dataKey="value"
                    radius={[0, 4, 4, 0]}
                    background={{ fill: "var(--color-muted)", radius: 4 }}
                    cursor={onDrillDown ? "pointer" : undefined}
                    onClick={(_data) => {
                      if (!onDrillDown) return;
                      const bracket = (
                        _data as unknown as { payload: AgingBracket }
                      ).payload;
                      if (!bracket) return;

                      // Convert aging bracket to date range for drill-down
                      const todayStr = new Date().toISOString().split("T")[0];
                      const todayMs = new Date(todayStr + "T12:00:00").getTime();
                      const DAY_MS = 86_400_000;

                      // "0-30" → dueDate between (today - 30 days) and yesterday
                      const dueDateTo = new Date(
                        todayMs - bracket.min * DAY_MS,
                      )
                        .toISOString()
                        .split("T")[0];
                      const dueDateFrom =
                        bracket.key === "90+"
                          ? "2020-01-01"
                          : new Date(todayMs - bracket.max * DAY_MS)
                              .toISOString()
                              .split("T")[0];

                      onDrillDown({
                        title: `Vencidos — ${bracket.label}`,
                        dueDateFrom,
                        dueDateTo,
                        overdue: true,
                      });
                    }}
                  >
                    {agingBrackets.map((bracket) => (
                      <Cell key={bracket.key} fill={bracket.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
