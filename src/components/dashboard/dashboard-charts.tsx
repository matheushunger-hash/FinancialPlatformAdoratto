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
  Cell,
  Label,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  DailyPaymentData,
  StatusDistribution,
  TopSupplier,
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
  payload?: { value: number; payload: { supplierName: string } }[];
}) {
  if (!active || !payload?.length) return null;

  const entry = payload[0];
  return (
    <div className={TOOLTIP_CLASS}>
      <p className="mb-1 font-medium">{entry.payload.supplierName}</p>
      <p className="tabular-nums">{formatBRL(entry.value)}</p>
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
  loading: boolean;
}

export function DashboardCharts({ charts, loading }: DashboardChartsProps) {
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

        {/* Chart 3 — Horizontal bar: top 10 suppliers with background tracks */}
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
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={charts.topSuppliers}
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
                    dataKey="supplierName"
                    tick={tickStyle}
                    tickLine={false}
                    axisLine={false}
                    width={150}
                  />
                  <Tooltip content={<CustomSupplierTooltip />} />
                  <Bar
                    dataKey="total"
                    fill="#635BFF"
                    radius={[0, 4, 4, 0]}
                    background={{ fill: "var(--color-muted)", radius: 4 }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
