"use client";

import { useEffect, useState } from "react";
import { KPICards } from "@/components/dashboard/kpi-cards";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import type { DashboardResponse } from "@/lib/dashboard/types";

// =============================================================================
// DashboardView — Orchestrator (ADR-015)
// =============================================================================
// Single fetch for both KPI cards and chart data. Distributes to children
// via props, following the same orchestrator pattern as PayablesView.
// =============================================================================

export function DashboardView() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    fetch(`/api/dashboard?month=${month}&year=${year}`)
      .then((res) => {
        if (!res.ok) throw new Error("Falha ao carregar dados do dashboard");
        return res.json();
      })
      .then((json: DashboardResponse) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-8">
      <KPICards data={data} loading={loading} error={error} />
      <DashboardCharts charts={data?.charts ?? null} loading={loading} />
    </div>
  );
}
