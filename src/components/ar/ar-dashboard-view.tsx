"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ARKPICards } from "@/components/ar/ar-kpi-cards";
import { UpcomingReceivables } from "@/components/ar/upcoming-receivables";
import type { ARDashboardSummary } from "@/lib/ar/types";

// =============================================================================
// ARDashboardView — Orchestrator for the AR dashboard (#70)
// =============================================================================
// Simplified vs AP DashboardView: no period selector (snapshot only), no
// charts, no drill-down sheet. Single fetch on mount, distributes to children.
// =============================================================================

export function ARDashboardView() {
  const [data, setData] = useState<ARDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);

    fetch("/api/ar/dashboard/summary")
      .then((res) => {
        if (!res.ok) throw new Error("Falha ao carregar dados do dashboard");
        return res.json();
      })
      .then((json: { data: ARDashboardSummary }) => {
        setData(json.data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Erro desconhecido");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <ARKPICards data={data} loading={loading} error={error} />
      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/recebimentos/analise">
            <BarChart3 className="mr-2 h-4 w-4" />
            Análise de Custos
          </Link>
        </Button>
      </div>
      <UpcomingReceivables data={data?.upcoming ?? null} loading={loading} />
    </div>
  );
}
