"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TopSuppliersTable } from "@/components/dashboard/top-suppliers-table";
import type { BuyerBudgetData, WeeklyTopSuppliers } from "@/lib/dashboard/types";

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Compact format for large values (e.g., R$ 280k)
function formatCompactBRL(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `R$ ${(value / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}k`;
  }
  return formatBRL(value);
}

const STATUS_CONFIG = {
  green: {
    label: "Dentro do limite",
    barColor: "bg-emerald-500",
    badgeVariant: "default" as const,
    badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15",
  },
  yellow: {
    label: "Próximo ao limite",
    barColor: "bg-yellow-500",
    badgeVariant: "default" as const,
    badgeClass: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/15",
  },
  red: {
    label: "Limite excedido",
    barColor: "bg-red-500",
    badgeVariant: "default" as const,
    badgeClass: "bg-red-500/15 text-red-700 dark:text-red-400 hover:bg-red-500/15",
  },
};

interface BuyerBudgetGaugeProps {
  data: BuyerBudgetData | null;
  weeklyTopSuppliers: WeeklyTopSuppliers | null;
  loading: boolean;
}

export function BuyerBudgetGauge({ data, weeklyTopSuppliers, loading }: BuyerBudgetGaugeProps) {
  if (loading || !data) {
    return (
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-3 w-full rounded-full" />
          <div className="flex justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-28" />
          </div>
          <Skeleton className="mt-4 h-px w-full" />
          <Skeleton className="h-4 w-44" />
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const config = STATUS_CONFIG[data.status];
  const isOver = data.remaining < 0;

  // Bar segments: pending as main metric, overdue as informational extra
  // data.totalOpen is pending-only after API refactor (overdue excluded from gauge)
  const pendingValue = data.totalOpen;
  const pendingCount = data.openCount;

  // Pending as % of limit (main metric)
  const pendingPercent = Math.min((pendingValue / data.limit) * 100, 100);

  // Overdue as additional % of limit (informational, not counted toward gauge)
  const overduePercent = data.overdueOpen > 0
    ? Math.min((data.overdueOpen / data.limit) * 100, 100 - pendingPercent)
    : 0;

  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Limite de Compras — Semana {data.weekLabel}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main figure */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">
            {formatCompactBRL(data.totalOpen)}
          </span>
          <span className="text-sm text-muted-foreground">
            / {formatCompactBRL(data.limit)}
          </span>
          <Badge variant="outline" className="ml-auto tabular-nums text-xs">
            {Math.round(data.utilization * 100)}%
          </Badge>
        </div>

        {/* Progress bar — two distinct color-coded segments */}
        <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
          <div className="flex h-full">
            {pendingPercent > 0 && (
              <div
                className={`h-full transition-all duration-500 bg-amber-500 rounded-l-full ${
                  overduePercent > 0 ? "" : "rounded-r-full"
                }`}
                style={{ width: `${pendingPercent}%` }}
                title={`Pendentes: ${formatBRL(pendingValue)} (${pendingCount})`}
              />
            )}
            {overduePercent > 0 && (
              <div
                className={`h-full rounded-r-full transition-all duration-500 bg-red-500 ${
                  pendingPercent > 0 ? "" : "rounded-l-full"
                }`}
                style={{ width: `${overduePercent}%` }}
                title={`Vencidos: ${formatBRL(data.overdueOpen)} (${data.overdueCount})`}
              />
            )}
          </div>
        </div>

        {/* Segment legend — colored dots with values */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span className="text-muted-foreground">
              Pendentes:{" "}
              <span className="font-medium tabular-nums text-foreground">
                {formatCompactBRL(pendingValue)}
              </span>
              <span className="ml-1 text-muted-foreground">({pendingCount})</span>
            </span>
          </span>
          {data.overdueCount > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
              <span className="text-muted-foreground">
                Vencidos:{" "}
                <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
                  {formatCompactBRL(data.overdueOpen)}
                </span>
                <span className="ml-1 text-muted-foreground">({data.overdueCount})</span>
              </span>
            </span>
          )}
        </div>

        {/* Status + remaining */}
        <div className="flex items-center justify-between">
          <Badge variant={config.badgeVariant} className={config.badgeClass}>
            {config.label}
          </Badge>
          <span className="text-sm tabular-nums text-muted-foreground">
            {isOver
              ? `Excedido em ${formatBRL(Math.abs(data.remaining))}`
              : `Restam ${formatBRL(data.remaining)}`}
          </span>
        </div>

        {/* Top 10 suppliers for the same week */}
        {weeklyTopSuppliers && (
          <TopSuppliersTable
            suppliers={weeklyTopSuppliers.suppliers}
            grandTotal={weeklyTopSuppliers.grandTotal}
            weekStart={data.weekStart}
            weekEnd={data.weekEnd}
          />
        )}
      </CardContent>
    </Card>
  );
}
