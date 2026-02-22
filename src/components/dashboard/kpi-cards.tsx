"use client";

import {
  DollarSign,
  AlertTriangle,
  Clock,
  CheckCircle,
  CalendarClock,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DashboardKPIs, KPICard } from "@/lib/dashboard/types";

// =============================================================================
// KPI Cards Component — Stripe/Linear aesthetic (#39)
// =============================================================================
// Clean white card surfaces with subtle shadows, large typography, optional
// delta % badge and sparkline mini-chart for period-filtered KPIs.
// =============================================================================

// Icon configuration for each KPI card (no color config — clean surfaces only)
interface CardConfig {
  key: keyof DashboardKPIs;
  icon: LucideIcon;
}

const CARD_CONFIGS: CardConfig[] = [
  { key: "totalPayable", icon: DollarSign },
  { key: "overdue", icon: AlertTriangle },
  { key: "dueSoon", icon: Clock },
  { key: "paidThisMonth", icon: CheckCircle },
  { key: "dueInPeriod", icon: CalendarClock },
  { key: "insuredInPeriod", icon: ShieldCheck },
];

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// -- Delta badge: shows +X% or -X% with trending arrow icon --
function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return null;
  const isPositive = delta > 0;
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
      {isPositive ? "+" : ""}
      {delta}%
    </span>
  );
}

// -- Sparkline: tiny area chart with gradient fill --
function SparklineChart({ data, kpiKey }: { data: number[]; kpiKey: string }) {
  const chartData = data.map((v) => ({ v }));
  const gradientId = `spark-${kpiKey}`;
  return (
    <div className="mt-3 h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#635BFF" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#635BFF" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke="#635BFF"
            fill={`url(#${gradientId})`}
            strokeWidth={1.5}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// -- Skeleton placeholder shown while data is loading --
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
          <Card key={config.key} className="rounded-xl shadow-sm">
            <CardContent className="p-6">
              {/* Label row with icon */}
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Icon className="h-4 w-4" />
                {kpi.label}
              </div>

              {/* Value + delta row */}
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight tabular-nums">
                  {formatBRL(kpi.value)}
                </span>
                {kpi.delta !== undefined && <DeltaBadge delta={kpi.delta} />}
              </div>

              {/* Count subtitle */}
              <p className="mt-1 text-sm text-muted-foreground">
                {kpi.count} título{kpi.count !== 1 ? "s" : ""}
              </p>

              {/* Percentage line (paidThisMonth only) */}
              {kpi.percentOfPlan !== undefined && (
                <p className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  {kpi.percentOfPlan}% do planejado
                </p>
              )}

              {/* Sparkline (period-filtered KPIs only) */}
              {kpi.sparkline && kpi.sparkline.length > 1 && (
                <SparklineChart data={kpi.sparkline} kpiKey={config.key} />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
