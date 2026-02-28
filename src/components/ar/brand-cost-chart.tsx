"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { BrandCostAnalysis } from "@/lib/ar/types";

// =============================================================================
// BrandCostChart — Horizontal bar chart of fee cost per brand (#73)
// =============================================================================
// Follows the AP dashboard-charts.tsx patterns: dark navy tooltip,
// currentColor axis ticks, CartesianGrid with stroke-border class.
// =============================================================================

interface BrandCostChartProps {
  data: BrandCostAnalysis | null;
  loading: boolean;
}

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCompactBRL(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}k`;
  return `R$ ${value.toFixed(0)}`;
}

// Custom tooltip matching the AP dashboard dark navy style
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload: { brand: string; feesTotal: number; avgFeePct: string; avgSettlementDays: number };
  }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg bg-[#0A2540] px-3 py-2 text-sm text-white shadow-lg dark:bg-popover dark:text-popover-foreground">
      <p className="font-medium">{d.brand}</p>
      <p className="mt-1 tabular-nums">Taxas: {formatBRL(d.feesTotal)}</p>
      <p className="tabular-nums">Taxa média: {d.avgFeePct}%</p>
      <p className="tabular-nums">Prazo médio: {d.avgSettlementDays} dias</p>
    </div>
  );
}

export function BrandCostChart({ data, loading }: BrandCostChartProps) {
  if (loading) {
    return (
      <Card className="rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Custo de Taxas por Bandeira</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.brands.length === 0) {
    return (
      <Card className="rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Custo de Taxas por Bandeira</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum dado disponível.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Transform string values to numbers for Recharts
  const chartData = data.brands.map((b) => ({
    brand: b.brand,
    feesTotal: Number(b.feesTotal),
    avgFeePct: b.avgFeePct,
    avgSettlementDays: b.avgSettlementDays,
  }));

  const chartHeight = chartData.length * 48 + 40;

  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Custo de Taxas por Bandeira</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              horizontal={false}
              className="stroke-border"
            />
            <XAxis
              type="number"
              tickFormatter={formatCompactBRL}
              tick={{ fill: "currentColor", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="brand"
              width={110}
              tick={{ fill: "currentColor", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "var(--color-muted)", opacity: 0.3 }}
            />
            <Bar
              dataKey="feesTotal"
              fill="#3b82f6"
              radius={[0, 4, 4, 0]}
              background={{ fill: "var(--color-muted)", radius: 4 }}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
