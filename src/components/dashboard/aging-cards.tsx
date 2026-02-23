"use client";

import { CalendarClock, AlertTriangle, BadgeDollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AgingOverview } from "@/lib/dashboard/types";

// =============================================================================
// AgingCards — 3 KPI cards for overdue payment aging (#78)
// =============================================================================
// Dedicated component because aging metrics have a different shape than the
// generic KPICard (days and counts, not just R$ values).
// Always-live (not period-filtered) since it reflects current state.
// =============================================================================

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function AgingCardSkeleton() {
  return (
    <Card className="rounded-xl shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="mt-3 h-8 w-24" />
        <Skeleton className="mt-2 h-4 w-16" />
      </CardContent>
    </Card>
  );
}

interface AgingCardsProps {
  data: AgingOverview | null;
  loading: boolean;
}

export function AgingCards({ data, loading }: AgingCardsProps) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AgingCardSkeleton />
        <AgingCardSkeleton />
        <AgingCardSkeleton />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* 1. Average days overdue */}
      <Card className="rounded-xl shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CalendarClock className="h-4 w-4" />
            Média de Atraso
          </div>
          <div className="mt-2">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {data.avgDaysOverdue}
            </span>
            <span className="ml-1 text-lg text-muted-foreground">dias</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            entre títulos vencidos
          </p>
        </CardContent>
      </Card>

      {/* 2. Accumulated interest/penalties */}
      <Card className="rounded-xl shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <BadgeDollarSign className="h-4 w-4" />
            Juros/Multa Acumulados
          </div>
          <div className="mt-2">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">
              {formatBRL(data.interestExposure)}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            em títulos vencidos
          </p>
        </CardContent>
      </Card>

      {/* 3. Critical count (90+ days) */}
      <Card className="rounded-xl shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            Críticos (90+ dias)
          </div>
          <div className="mt-2">
            <span
              className={cn(
                "text-3xl font-semibold tracking-tight tabular-nums",
                data.criticalCount > 0
                  ? "text-red-600 dark:text-red-400"
                  : "",
              )}
            >
              {data.criticalCount}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            título{data.criticalCount !== 1 ? "s" : ""} com risco de protesto
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
