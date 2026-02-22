"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KPICards } from "@/components/dashboard/kpi-cards";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import type { DashboardResponse } from "@/lib/dashboard/types";

// =============================================================================
// DashboardView — Orchestrator (ADR-015 / ADR-016)
// =============================================================================
// Single fetch for both KPI cards and chart data. Distributes to children
// via props, following the same orchestrator pattern as PayablesView.
//
// The selected period (from/to) lives in the URL search params so that:
// - Users can bookmark or share a specific period
// - Browser back/forward navigates between periods
// - Defaults to the current month if no params are present
// =============================================================================

// Helper: compute default "from" and "to" for the current month
function getDefaultRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function DashboardView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read from/to from URL, falling back to current month
  const defaults = getDefaultRange();
  const from = searchParams.get("from") || defaults.from;
  const to = searchParams.get("to") || defaults.to;

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch dashboard data whenever the period changes
  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/dashboard?from=${from}&to=${to}`)
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
  }, [from, to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // When the user picks a new period, update the URL (triggers re-fetch via useEffect)
  function handlePeriodChange(newFrom: string, newTo: string) {
    router.replace(`/dashboard?from=${newFrom}&to=${newTo}`);
  }

  return (
    <div className="space-y-6">
      {/* Snapshot KPIs — always live, independent of period filter */}
      <KPICards
        data={data}
        loading={loading}
        error={error}
        keys={["totalPayable", "overdue", "dueSoon"]}
      />

      {/* Period selector — visually separates frozen KPIs from filtered content */}
      <PeriodSelector from={from} to={to} onChange={handlePeriodChange} />

      {/* Period-filtered content: KPI 4 + all charts */}
      <KPICards
        data={data}
        loading={loading}
        error={error}
        keys={["paidThisMonth", "dueInPeriod", "insuredInPeriod"]}
      />
      <DashboardCharts charts={data?.charts ?? null} loading={loading} />
    </div>
  );
}
