"use client";

import Link from "next/link";
import {
  DollarSign,
  CalendarCheck,
  Clock,
  Percent,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ARDashboardSummary } from "@/lib/ar/types";

// =============================================================================
// AR KPI Cards — 4 cards + overdue alert (#70)
// =============================================================================
// Follows the same Card + CardContent + p-6 aesthetic as the AP kpi-cards.tsx,
// but with AR-specific data shape (ARDashboardSummary vs DashboardKPIs).
// =============================================================================

interface ARKPICardsProps {
  data: ARDashboardSummary | null;
  loading: boolean;
  error: string | null;
}

function formatBRL(value: string): string {
  const num = Number(value);
  if (isNaN(num)) return value;
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(value: string): string {
  const num = Number(value);
  if (isNaN(num)) return value;
  return `${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

// Delta badge — shows +X% or -X% with trending arrow
function DeltaBadge({ value }: { value: string }) {
  const num = Number(value);
  if (isNaN(num) || num === 0) return null;
  const isPositive = num > 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        isPositive
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400",
      )}
    >
      <Icon className="h-3 w-3" />
      {value}%
    </span>
  );
}

// Skeleton placeholder for loading state
function KPICardSkeleton() {
  return (
    <Card className="rounded-xl shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="mt-3 h-8 w-36" />
        <Skeleton className="mt-2 h-4 w-20" />
      </CardContent>
    </Card>
  );
}

export function ARKPICards({ data, loading, error }: ARKPICardsProps) {
  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  // Loading state
  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KPICardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1 — Total a Receber */}
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              Total a Receber
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                {formatBRL(data.totalPending.amount)}
              </span>
              <DeltaBadge value={data.weekOverWeekPct} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.totalPending.count} transação{data.totalPending.count !== 1 ? "ões" : ""} pendente{data.totalPending.count !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        {/* Card 2 — Recebimentos Hoje */}
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CalendarCheck className="h-4 w-4" />
              Recebimentos Hoje
            </div>
            <div className="mt-2">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                {formatBRL(data.receivableToday.amount)}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.receivableToday.count} transação{data.receivableToday.count !== 1 ? "ões" : ""} hoje
            </p>
          </CardContent>
        </Card>

        {/* Card 3 — Próximos 7 Dias */}
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="h-4 w-4" />
              Próximos 7 Dias
            </div>
            <div className="mt-2">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                {formatBRL(data.next7Days.amount)}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.next7Days.count} transação{data.next7Days.count !== 1 ? "ões" : ""}
            </p>
          </CardContent>
        </Card>

        {/* Card 4 — Custo de Taxas (Mês) */}
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Percent className="h-4 w-4" />
              Custo de Taxas (Mês)
            </div>
            <div className="mt-2">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                {formatBRL(data.feesThisMonth.amount)}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Taxa média: {formatPct(data.feesThisMonth.avgPct)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Overdue alert — only shown when there are overdue transactions */}
      {data.overdueCount > 0 && (
        <Link href="/dashboard/recebimentos/transacoes?status=OVERDUE">
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20">
            <AlertTriangle className="h-4 w-4" />
            {data.overdueCount} transação{data.overdueCount !== 1 ? "ões" : ""} vencida{data.overdueCount !== 1 ? "s" : ""}
          </div>
        </Link>
      )}
    </div>
  );
}
