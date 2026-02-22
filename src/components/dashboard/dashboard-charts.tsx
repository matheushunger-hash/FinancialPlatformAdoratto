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
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  DailyPaymentData,
  StatusDistribution,
  TopSupplier,
} from "@/lib/dashboard/types";

// =============================================================================
// Dashboard Charts Component (ADR-015)
// =============================================================================
// Renders 3 Recharts charts: stacked bar (daily payments), donut (status
// distribution), and horizontal bar (top 10 suppliers). Receives data as props
// from the DashboardView orchestrator.
// =============================================================================

// -- Status color map (hex for Recharts SVG fills) --
const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b", // amber
  APPROVED: "#3b82f6", // blue
  PAID: "#22c55e", // green
  OVERDUE: "#ef4444", // red
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

// -- Custom Tooltip --
// Recharts tooltips need custom styling to work well in dark mode.
// We use CSS variables from the shadcn theme for background/border/text.

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

function CustomBarTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: number;
}) {
  if (!active || !payload?.length) return null;

  // Only show statuses that have a non-zero value
  const nonZero = payload.filter((p) => p.value > 0);
  if (nonZero.length === 0) return null;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">Dia {label}</p>
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
    <div className="rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
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
    <div className="rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
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
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[350px] w-full" />
        </CardContent>
      </Card>
      {/* Two side-by-side chart skeletons */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
        <Card>
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

  return (
    <div className="space-y-6">
      {/* Chart 1 — Stacked bar: daily payments by status (full width) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Pagamentos por Dia do Mês
          </CardTitle>
        </CardHeader>
        <CardContent>
          {charts.dailyPayments.length === 0 ? (
            <EmptyChart message="Sem dados para este mês." />
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={charts.dailyPayments}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="day"
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
                <Tooltip content={<CustomBarTooltip />} />
                <Legend
                  formatter={(value: string) =>
                    STATUS_LABELS[value] ?? value
                  }
                />
                {ALL_STATUSES.map((status) => (
                  <Bar
                    key={status}
                    dataKey={status}
                    stackId="a"
                    fill={STATUS_COLORS[status]}
                    radius={0}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Bottom row: donut (left) + top suppliers (right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Chart 2 — Donut: status distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Distribuição por Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {charts.statusDistribution.length === 0 ? (
              <EmptyChart message="Sem dados para este mês." />
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

        {/* Chart 3 — Horizontal bar: top 10 suppliers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Top 10 Fornecedores por Valor
            </CardTitle>
          </CardHeader>
          <CardContent>
            {charts.topSuppliers.length === 0 ? (
              <EmptyChart message="Sem dados para este mês." />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={charts.topSuppliers}
                  layout="vertical"
                  margin={{ left: 20 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-border"
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
                    fill="#3b82f6"
                    radius={[0, 4, 4, 0]}
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
