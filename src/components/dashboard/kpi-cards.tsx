"use client";

import {
  DollarSign,
  AlertTriangle,
  Clock,
  CheckCircle,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardKPIs, KPICard } from "@/lib/dashboard/types";

// =============================================================================
// KPI Cards Component
// =============================================================================
// Fetches dashboard aggregations and renders 4 color-coded financial KPI cards.
// Each card shows: icon + label, R$ value (large), count subtitle, and
// optionally a "% do planejado" line for the "Pagos no Mês" card.
// =============================================================================

// Color and icon configuration for each KPI card
interface CardConfig {
  key: keyof DashboardKPIs;
  icon: LucideIcon;
  color: string; // Tailwind color class prefix (e.g. "blue" → text-blue-500)
  borderColor: string; // Left border accent color
  iconColor: string; // Icon color
}

const CARD_CONFIGS: CardConfig[] = [
  {
    key: "totalPayable",
    icon: DollarSign,
    color: "blue",
    borderColor: "border-l-blue-500",
    iconColor: "text-blue-500",
  },
  {
    key: "overdue",
    icon: AlertTriangle,
    color: "red",
    borderColor: "border-l-red-500",
    iconColor: "text-red-500",
  },
  {
    key: "dueSoon",
    icon: Clock,
    color: "amber",
    borderColor: "border-l-amber-500",
    iconColor: "text-amber-500",
  },
  {
    key: "paidThisMonth",
    icon: CheckCircle,
    color: "green",
    borderColor: "border-l-green-500",
    iconColor: "text-green-500",
  },
];

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Skeleton placeholder shown while data is loading
function KPICardSkeleton() {
  return (
    <Card className="border-l-4 border-l-muted">
      <CardContent className="pt-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="mt-3 h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-20" />
      </CardContent>
    </Card>
  );
}

// Props received from the DashboardView orchestrator
interface KPICardsProps {
  data: DashboardKPIs | null;
  loading: boolean;
  error: string | null;
}

export function KPICards({ data, loading, error }: KPICardsProps) {
  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  // Loading state — 4 skeleton cards in the same grid layout
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {CARD_CONFIGS.map((config) => {
        const kpi: KPICard = data[config.key];
        const Icon = config.icon;

        return (
          <Card
            key={config.key}
            className={`border-l-4 ${config.borderColor}`}
          >
            <CardContent className="pt-6">
              {/* Label row with icon */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className={`h-4 w-4 ${config.iconColor}`} />
                {kpi.label}
              </div>

              {/* R$ value — large and bold */}
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {formatBRL(kpi.value)}
              </div>

              {/* Count subtitle */}
              <p className="mt-1 text-sm text-muted-foreground">
                {kpi.count} título{kpi.count !== 1 ? "s" : ""}
              </p>

              {/* Percentage line — only for "Pagos no Mês" */}
              {kpi.percentOfPlan !== undefined && (
                <p className="mt-1 text-sm font-medium text-green-600 dark:text-green-400">
                  {kpi.percentOfPlan}% do planejado
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
