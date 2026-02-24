"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KPICards } from "@/components/dashboard/kpi-cards";
import { AgingCards } from "@/components/dashboard/aging-cards";
import { BuyerBudgetGauge } from "@/components/dashboard/buyer-budget-gauge";
import { WeeklyCalendar, type SelectedWeek } from "@/components/dashboard/weekly-calendar";
import { WeekTopInvoices } from "@/components/dashboard/week-top-invoices";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { DrillDownSheet } from "@/components/dashboard/drill-down-sheet";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import type { DashboardResponse, DrillDownFilter } from "@/lib/dashboard/types";

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
  const [drillDown, setDrillDown] = useState<DrillDownFilter | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<SelectedWeek | null>(null);

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

  // Default the selected week to the current week once data loads
  useEffect(() => {
    if (data?.weeklyCalendar && !selectedWeek) {
      const current = data.weeklyCalendar.find((w) => w.isCurrent);
      if (current) {
        setSelectedWeek({
          weekStart: current.weekStart,
          weekEnd: current.weekEnd,
          label: current.label,
        });
      }
    }
  }, [data, selectedWeek]);

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
        from={from}
        to={to}
        onDrillDown={setDrillDown}
      />

      {/* Aging breakdown — always-live, current overdue state (#78) */}
      <AgingCards
        data={data?.agingOverview ?? null}
        loading={loading}
      />

      {/* Buyer budget + weekly calendar — always-live (#84) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <BuyerBudgetGauge
            data={data?.buyerBudget ?? null}
            weeklyTopSuppliers={data?.weeklyTopSuppliers ?? null}
            loading={loading}
          />
        </div>
        <div className="lg:col-span-3">
          <WeeklyCalendar
            data={data?.weeklyCalendar ?? null}
            loading={loading}
            onDrillDown={setDrillDown}
            onWeekSelect={setSelectedWeek}
            selectedWeekLabel={selectedWeek?.label}
          >
            {selectedWeek && (
              <WeekTopInvoices
                weekStart={selectedWeek.weekStart}
                weekEnd={selectedWeek.weekEnd}
                weekLabel={selectedWeek.label}
                onDrillDown={() =>
                  setDrillDown({
                    title: `Semana ${selectedWeek.label}`,
                    dueDateFrom: selectedWeek.weekStart,
                    dueDateTo: selectedWeek.weekEnd,
                  })
                }
              />
            )}
          </WeeklyCalendar>
        </div>
      </div>

      {/* Period selector — visually separates frozen KPIs from filtered content */}
      <PeriodSelector from={from} to={to} onChange={handlePeriodChange} />

      {/* Period-filtered content: KPI 4 + all charts */}
      <KPICards
        data={data}
        loading={loading}
        error={error}
        keys={["paidThisMonth", "dueInPeriod", "insuredInPeriod"]}
        from={from}
        to={to}
        onDrillDown={setDrillDown}
      />
      <DashboardCharts
        charts={data?.charts ?? null}
        agingBrackets={data?.agingOverview?.agingBrackets}
        loading={loading}
        from={from}
        to={to}
        onDrillDown={setDrillDown}
      />
      <DrillDownSheet
        filter={drillDown}
        onOpenChange={(open) => { if (!open) setDrillDown(null); }}
      />
    </div>
  );
}
