"use client";

import { AlertTriangle, DollarSign, Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SupplierSummary } from "@/lib/suppliers/types";

// =============================================================================
// SupplierKPICards — 3 financial summary cards for a supplier
// =============================================================================
// Total Pago (green), Títulos Abertos (blue), Títulos Vencidos (red).
// Same visual pattern as dashboard KPIs but typed for SupplierSummary.
// =============================================================================

interface SupplierKPICardsProps {
  summary: SupplierSummary | null;
  loading: boolean;
}

// --- Helper: format R$ currency ---
function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// --- Card config: data-driven rendering ---
interface CardConfig {
  key: keyof SupplierSummary;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  borderColor: string;
  iconColor: string;
  valueColorWhenPositive?: string;
}

const CARD_CONFIGS: CardConfig[] = [
  {
    key: "totalPaid",
    label: "Total Pago",
    icon: DollarSign,
    borderColor: "border-l-green-500",
    iconColor: "text-green-600",
  },
  {
    key: "openPayables",
    label: "Títulos Abertos",
    icon: Receipt,
    borderColor: "border-l-blue-500",
    iconColor: "text-blue-600",
  },
  {
    key: "overduePayables",
    label: "Títulos Vencidos",
    icon: AlertTriangle,
    borderColor: "border-l-red-500",
    iconColor: "text-red-600",
    valueColorWhenPositive: "text-red-600 dark:text-red-400",
  },
];

export function SupplierKPICards({ summary, loading }: SupplierKPICardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-8 w-8 rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {CARD_CONFIGS.map((config) => {
        const data = summary[config.key];
        const Icon = config.icon;
        const hasPositive = data.count > 0 && config.valueColorWhenPositive;

        return (
          <Card key={config.key} className={`border-l-4 ${config.borderColor}`}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">
                    {config.label}
                  </p>
                  <p
                    className={`text-xl font-bold tabular-nums mt-1 ${hasPositive ? config.valueColorWhenPositive : ""}`}
                  >
                    {formatBRL(data.value)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {data.count} {data.count === 1 ? "título" : "títulos"}
                  </p>
                </div>
                <div className={`${config.iconColor} opacity-80`}>
                  <Icon className="h-8 w-8" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
