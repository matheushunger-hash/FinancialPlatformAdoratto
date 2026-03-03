"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ARKPICards } from "@/components/ar/ar-kpi-cards";
import { ReceivableCalendar } from "@/components/ar/receivable-calendar";
import { UpcomingReceivables } from "@/components/ar/upcoming-receivables";
import type { ARDashboardSummary, CalendarDay, CalendarResponse } from "@/lib/ar/types";

// =============================================================================
// ARDashboardView — Orchestrator for the AR dashboard (#70, #74)
// =============================================================================
// Fetches summary (KPI cards + upcoming table) and calendar (30-day timeline)
// in parallel. Each section loads independently — if one fails, the other
// still renders.
// =============================================================================

export function ARDashboardView() {
  // Summary state (KPI cards + upcoming table)
  const [data, setData] = useState<ARDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calendar state (30-day timeline)
  const [calendarDays, setCalendarDays] = useState<CalendarDay[] | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(true);

  // Computed once to avoid hydration mismatch between server and client
  const [today] = useState(() => new Date().toISOString().split("T")[0]);

  const fetchData = useCallback(() => {
    // --- Summary fetch ---
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

    // --- Calendar fetch (independent) ---
    setCalendarLoading(true);

    fetch("/api/ar/dashboard/calendar")
      .then((res) => {
        if (!res.ok) throw new Error("Falha ao carregar calendário");
        return res.json();
      })
      .then((json: { data: CalendarResponse }) => {
        setCalendarDays(json.data.days);
        setCalendarLoading(false);
      })
      .catch(() => {
        // Calendar failure is non-critical — show empty state
        setCalendarDays([]);
        setCalendarLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <ARKPICards data={data} loading={loading} error={error} />
      <ReceivableCalendar
        data={calendarDays}
        loading={calendarLoading}
        today={today}
      />
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
