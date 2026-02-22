"use client";

import {
  DollarSign,
  AlertTriangle,
  Clock,
  CheckCircle,
  CalendarClock,
  ShieldCheck,
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
  {
    key: "dueInPeriod",
    icon: CalendarClock,
    color: "purple",
    borderColor: "border-l-purple-500",
    iconColor: "text-purple-500",
  },
  {
    key: "insuredInPeriod",
    icon: ShieldCheck,
    color: "teal",
    borderColor: "border-l-teal-500",
    iconColor: "text-teal-500",
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

// Grid column classes based on how many cards are shown
const GRID_CLASSES: Record<number, string> = {
  1: "grid grid-cols-1 gap-4 sm:max-w-sm",
  2: "grid grid-cols-1 gap-4 sm:grid-cols-2",
  3: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4",
  5: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5",
  6: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
};

// Props received from the DashboardView orchestrator
interface KPICardsProps {
  data: DashboardKPIs | null;
  loading: boolean;
  error: string | null;
  keys?: (keyof DashboardKPIs)[]; // Optional filter — show only these cards
}

export function KPICards({ data, loading, error, keys }: KPICardsProps) {
  // Filter configs based on keys prop (show all if not provided)
  const configs = keys
    ? CARD_CONFIGS.filter((c) => keys.includes(c.key))
    : CARD_CONFIGS;

  const gridClass = GRID_CLASSES[configs.length] ?? GRID_CLASSES[4];

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  // Loading state — skeleton cards matching the filtered count
  if (loading || !data) {
    return (
      <div className={gridClass}>
        {configs.map((_, i) => (
          <KPICardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className={gridClass}>
      {configs.map((config) => {
        const kpi = data[config.key] as KPICard | undefined;
        if (!kpi) return null; // Guard: skip if API hasn't returned this KPI yet
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
