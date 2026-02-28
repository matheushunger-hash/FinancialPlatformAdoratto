"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { BrandCostChart } from "@/components/ar/brand-cost-chart";
import { BrandAnalyticsTable } from "@/components/ar/brand-analytics-table";
import type { BrandCostAnalysis } from "@/lib/ar/types";

// =============================================================================
// BrandAnalyticsView — Orchestrator for brand cost analysis page (#73)
// =============================================================================
// URL-driven period selection (from/to), fetches brand aggregations from the
// API, distributes data to chart and table children.
// =============================================================================

function defaultPeriod() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(yyyy, now.getMonth() + 1, 0).getDate();
  return {
    from: `${yyyy}-${mm}-01`,
    to: `${yyyy}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function BrandAnalyticsView() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const defaults = defaultPeriod();
  const from = searchParams.get("from") || defaults.from;
  const to = searchParams.get("to") || defaults.to;

  const [data, setData] = useState<BrandCostAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ar/analytics/brands?from=${from}&to=${to}`);
      if (!res.ok) throw new Error("Falha ao carregar dados");
      const json = await res.json();
      setData(json.data);
    } catch {
      toast.error("Erro ao carregar análise de custos");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handlePeriodChange(newFrom: string, newTo: string) {
    router.replace(`/dashboard/recebimentos/analise?from=${newFrom}&to=${newTo}`);
  }

  return (
    <div className="space-y-6">
      <PeriodSelector from={from} to={to} onChange={handlePeriodChange} />
      <BrandCostChart data={data} loading={loading} />
      <BrandAnalyticsTable data={data} loading={loading} />
    </div>
  );
}
