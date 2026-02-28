"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  PieChart,
  Pie,
  Label,
  Cell,
  Sector,
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
import { DISPLAY_STATUS_CONFIG, type DisplayStatus } from "@/lib/payables/status";

// =============================================================================
// Dashboard Charts Component — Stripe/Linear aesthetic (#39)
// =============================================================================
// 3 Recharts charts: stacked bar (daily payments), donut with center label
// (status distribution), horizontal bar with background tracks (top suppliers).
// Dark navy tooltips in light mode, popover colors in dark mode.
// =============================================================================

// Helper: today as YYYY-MM-DD using local time (avoids UTC shift in Brazil, #40)
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// -- Status color map (DisplayStatus keys) --
const STATUS_COLORS: Record<DisplayStatus, string> = {
  A_VENCER: "#1E40AF",
  VENCE_HOJE: "#D97706",
  VENCIDO: "#DC2626",
  APROVADO: "#3b82f6",
  SEGURADO: "#7C3AED",
  PAGO: "#059669",
  PROTESTADO: "#991B1B",
  CANCELADO: "#6B7280",
};

// Portuguese labels for the legend and tooltips — derived from DISPLAY_STATUS_CONFIG
const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(DISPLAY_STATUS_CONFIG).map(([key, cfg]) => [key, cfg.label]),
);

// Urgency-tier palette — same as weekly-calendar.tsx
const PENDING_TIER_COLORS: Record<UrgencyTier, string> = {
  green: "#22C55E",
  yellow: "#F59E0B",
  orange: "#F97316",
  red: "#DC2626",
};
const OVERDUE_COLOR = "#EF4444";
const PAID_COLOR = "#059669"; // green — matches PAGO in STATUS_COLORS

const ALL_STATUSES: DisplayStatus[] = [
  "A_VENCER",
  "VENCE_HOJE",
  "VENCIDO",
  "APROVADO",
  "SEGURADO",
  "PAGO",
  "PROTESTADO",
  "CANCELADO",
];

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

// Compact format with R$ prefix for summary ribbons (e.g. "R$ 120,5k")
function formatRibbonBRL(value: number): string {
  if (value >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  }
  return `R$ ${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
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

  // Day total across all statuses
  const dayTotal = payload.reduce((sum, p) => sum + (p.value || 0), 0);

  return (
    <div className={TOOLTIP_CLASS}>
      <p className="mb-1 font-medium">{label ? formatDateLabel(label) : ""}</p>
      <p className="mb-1.5 border-b border-white/20 pb-1.5 text-base font-semibold tabular-nums">
        {formatBRL(dayTotal)}
      </p>
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
  payload?: { name: string; value: number; payload: { status: string; value: number } }[];
}) {
  if (!active || !payload?.length) return null;

  const entry = payload[0];
  return (
    <div className={TOOLTIP_CLASS}>
      <p className="font-medium">
        {STATUS_LABELS[entry.payload.status] ?? entry.name}: {entry.value} título{entry.value !== 1 ? "s" : ""}
      </p>
      <p className="tabular-nums">{formatBRL(entry.payload.value)}</p>
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

// -- Exploded pie slice — offsets the VENCIDO sector outward --

const RADIAN = Math.PI / 180;
const OVERDUE_OFFSET = 6; // pixels to "explode" the overdue slice

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ExplodedSector(props: any) {
  const { cx, cy, midAngle, payload, ...rest } = props;
  const isOverdue = payload?.status === "VENCIDO";
  const offset = isOverdue ? OVERDUE_OFFSET : 0;
  const offsetX = offset * Math.cos(-midAngle * RADIAN);
  const offsetY = offset * Math.sin(-midAngle * RADIAN);
  return (
    <Sector
      {...rest}
      cx={(cx ?? 0) + offsetX}
      cy={(cy ?? 0) + offsetY}
      midAngle={midAngle}
    />
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

  // -- Summary ribbon data for daily payments chart --
  const dailyData = charts.dailyPayments;

  // Period total (all statuses, all days)
  const periodTotal = dailyData.reduce(
    (sum, day) => sum + ALL_STATUSES.reduce((s, st) => s + day[st], 0),
    0,
  );

  // Per-status totals, sorted descending, filtered to non-zero — take top 3
  const statusTotals = ALL_STATUSES
    .map((status) => ({
      status,
      total: dailyData.reduce((s, day) => s + day[status], 0),
    }))
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  // "Hoje" reference line — only when today falls within the data range
  const todayStr = toISODate(new Date());
  const showTodayLine = dailyData.some((d) => d.date === todayStr);

  // Totals for donut center label (count + R$ value)
  const donutTotal = charts.statusDistribution.reduce(
    (sum, s) => sum + s.count,
    0,
  );
  const donutTotalValue = charts.statusDistribution.reduce(
    (sum, s) => sum + s.value,
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
            <>
            {/* Summary ribbon */}
            {periodTotal > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {formatRibbonBRL(periodTotal)}
                  </span>{" "}
                  total
                </span>
                {statusTotals.map((s) => (
                  <span key={s.status} className="flex items-center gap-1.5">
                    <span>·</span>
                    <span
                      className="font-semibold tabular-nums"
                      style={{ color: STATUS_COLORS[s.status] }}
                    >
                      {formatRibbonBRL(s.total)}
                    </span>{" "}
                    {STATUS_LABELS[s.status]?.toLowerCase()}
                  </span>
                ))}
              </div>
            )}
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
                {showTodayLine && (
                  <ReferenceLine
                    x={todayStr}
                    stroke="currentColor"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                    label={{
                      value: "Hoje",
                      position: "top",
                      fill: "currentColor",
                      fontSize: 11,
                      fontWeight: 500,
                    }}
                  />
                )}
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
            </>
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
                    shape={<ExplodedSector />}
                    style={onDrillDown ? { cursor: "pointer" } : undefined}
                  >
                    {charts.statusDistribution.map((entry) => (
                      <Cell
                        key={entry.status}
                        fill={STATUS_COLORS[entry.status] ?? "#9ca3af"}
                        onClick={() => {
                          if (!onDrillDown || !from || !to) return;
                          const label = STATUS_LABELS[entry.status] ?? entry.status;
                          // VENCIDO uses a wider date range (all-time overdue)
                          if (entry.status === "VENCIDO") {
                            onDrillDown({
                              title: label,
                              displayStatus: "VENCIDO",
                              dueDateFrom: "2020-01-01",
                              dueDateTo: toISODate(new Date()),
                            });
                          } else {
                            onDrillDown({
                              title: label,
                              displayStatus: entry.status,
                              dueDateFrom: from,
                              dueDateTo: to,
                            });
                          }
                        }}
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
                                dy="-0.8em"
                                className="fill-foreground text-2xl font-bold"
                              >
                                {donutTotal}
                              </tspan>
                              <tspan
                                x={viewBox.cx}
                                dy="1.3em"
                                className="fill-muted-foreground text-xs"
                              >
                                títulos
                              </tspan>
                              <tspan
                                x={viewBox.cx}
                                dy="1.3em"
                                className="fill-muted-foreground text-xs"
                              >
                                {formatCompactBRL(donutTotalValue)}
                              </tspan>
                            </text>
                          );
                        }
                      }}
                    />
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                  <Legend
                    formatter={(value: string) => {
                      const item = charts.statusDistribution.find(s => s.status === value);
                      const label = STATUS_LABELS[value] ?? value;
                      return item ? `${label} — ${formatCompactBRL(item.value)}` : label;
                    }}
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
                      const todayStr = toISODate(new Date());
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
                        displayStatus: "VENCIDO",
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
