"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { BuyerBudgetData } from "@/lib/dashboard/types";

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
  loading: boolean;
}

export function BuyerBudgetGauge({ data, loading }: BuyerBudgetGaugeProps) {
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
        </CardContent>
      </Card>
    );
  }

  const config = STATUS_CONFIG[data.status];
  const isOver = data.remaining < 0;

  // Split progress bar into pending + overdue segments (#91)
  const pendingOpen = data.totalOpen - data.overdueOpen;
  const fillPercent = Math.min((data.totalOpen / data.limit) * 100, 100);
  const pendingWidth = data.totalOpen > 0
    ? (pendingOpen / data.totalOpen) * fillPercent : 0;
  const overdueWidth = data.totalOpen > 0
    ? (data.overdueOpen / data.totalOpen) * fillPercent : 0;

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

        {/* Progress bar — split into pending + overdue segments (#91) */}
        <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
          <div className="flex h-full">
            {pendingWidth > 0 && (
              <div
                className={`h-full transition-all duration-500 ${config.barColor} rounded-l-full ${
                  overdueWidth > 0 ? "" : "rounded-r-full"
                }`}
                style={{ width: `${pendingWidth}%` }}
              />
            )}
            {overdueWidth > 0 && (
              <div
                className={`h-full rounded-r-full transition-all duration-500 bg-red-500 ${
                  pendingWidth > 0 ? "" : "rounded-l-full"
                }`}
                style={{ width: `${overdueWidth}%` }}
              />
            )}
          </div>
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
            {data.overdueOpen > 0 && !isOver && (
              <span className="text-red-500">
                {" "}({formatCompactBRL(data.overdueOpen)} vencido)
              </span>
            )}
          </span>
        </div>

        {/* Count */}
        <p className="text-xs text-muted-foreground">
          {data.openCount - data.overdueCount} pendente{data.openCount - data.overdueCount !== 1 ? "s" : ""}
          {data.overdueCount > 0 && (
            <span className="text-red-500">
              , {data.overdueCount} vencido{data.overdueCount !== 1 ? "s" : ""}
            </span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
