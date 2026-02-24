import { NextRequest, NextResponse } from "next/server";
import { startOfWeek, endOfWeek, addWeeks } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import type {
  DashboardResponse,
  DailyPaymentData,
  BuyerBudgetData,
  WeeklyPaymentData,
  UrgencyTier,
} from "@/lib/dashboard/types";

// =============================================================================
// GET /api/dashboard — Financial KPI aggregations + chart data
// =============================================================================
// Returns 6 KPI cards (with deltas + sparklines for period-filtered KPIs)
// and 3 chart datasets for the dashboard.
// All queries are scoped by tenantId.
//
// Query params:
//   from (ISO date, e.g. "2026-02-01") — defaults to 1st of current month
//   to   (ISO date, e.g. "2026-02-28") — defaults to last day of current month
// =============================================================================

// Budget utilization thresholds: green < 80%, yellow 80-95%, red > 95%
const BUDGET_THRESHOLDS = { green: 0.80, yellow: 0.95 };

// Compute % change between current and previous values
function computeDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// Build a sparkline array from a Map of day → value, filling zero for missing days
function buildSparkline(
  byDay: Map<string, number>,
  rangeStart: Date,
  rangeEnd: Date,
): number[] {
  const values: number[] = [];
  const cursor = new Date(rangeStart);
  while (cursor <= rangeEnd) {
    const day = cursor.toISOString().split("T")[0];
    values.push(byDay.get(day) ?? 0);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return values;
}

// Determine urgency tier for a weekly bucket based on overdue ratio and aging
function computeUrgencyTier(w: { overdueValue: number; totalValue: number; maxDaysOverdue: number }): UrgencyTier {
  if (w.overdueValue === 0) return "green";
  const ratio = w.totalValue > 0 ? w.overdueValue / w.totalValue : 0;
  if (ratio > 0.5 || w.maxDaysOverdue > 60) return "red";
  if (ratio > 0.2 || w.maxDaysOverdue > 30) return "orange";
  return "yellow";
}

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse from/to from query params, defaulting to current month boundaries
  const { searchParams } = new URL(request.url);
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const defaultTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const fromParam = searchParams.get("from") || defaultFrom;
  const toParam = searchParams.get("to") || defaultTo;

  // Build date boundaries — explicit UTC (Z suffix) so server timezone doesn't shift dates
  const rangeStart = new Date(fromParam + "T00:00:00.000Z");
  const rangeEnd = new Date(toParam + "T23:59:59.999Z");

  // Previous equivalent period: same duration, immediately before selected range
  // e.g., Feb 1–28 (28 days) → Jan 4–31 (28 days)
  const periodMs = rangeEnd.getTime() - rangeStart.getTime();
  const prevRangeEnd = new Date(rangeStart.getTime() - 1);
  prevRangeEnd.setUTCHours(23, 59, 59, 999);
  const prevRangeStart = new Date(rangeStart.getTime() - periodMs - 86400000);
  prevRangeStart.setUTCHours(0, 0, 0, 0);

  // "today" at midnight local time — used for overdue/due-soon comparisons
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 7 days from now (end of day) — upper bound for "due soon"
  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  sevenDaysFromNow.setHours(23, 59, 59, 999);

  // Weekly calendar: Sat–Fri weeks (#84)
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 6 });
  const currentWeekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 6 });
  const lastWeekEnd = endOfWeek(addWeeks(currentWeekStart, 4), { weekStartsOn: 6 });

  // Common filter: only this tenant, only active statuses (not yet paid/cancelled)
  const activeStatuses = ["PENDING", "APPROVED"] as const;
  const tenantScope = { tenantId: ctx.tenantId };

  try {
    // Split queries into two batches to stay within pool connection limits.
    // Batch 1: core KPIs + chart data (10 queries)
    // Batch 2: deltas, sparklines, budget gauge, weekly calendar (8 queries)
    const [
      totalPayable,
      overdue,
      dueSoon,
      paidThisMonth,
      plannedThisMonth,
      dailyRaw,
      statusRaw,
      topSuppliersRaw,
      dueInPeriod,
      insuredInPeriod,
    ] = await Promise.all([
      // 1. Total a Pagar — all PENDING + APPROVED payables
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          status: { in: [...activeStatuses] },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 2. Vencidos — dueDate < today AND still PENDING/APPROVED
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          status: { in: [...activeStatuses] },
          dueDate: { lt: today },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 3. A Vencer 7 dias — dueDate between today and today+7, still active
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          status: { in: [...activeStatuses] },
          dueDate: { gte: today, lte: sevenDaysFromNow },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 4. Pagos no Período — status PAID, paidAt within the selected range
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          status: "PAID",
          paidAt: { gte: rangeStart, lte: rangeEnd },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 5. Planned for the period (denominator for %)
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          dueDate: { gte: rangeStart, lte: rangeEnd },
        },
        _sum: { payValue: true },
      }),

      // 6. Daily payments — grouped by dueDate + status for stacked bar chart
      prisma.payable.groupBy({
        by: ["dueDate", "status"],
        where: {
          ...tenantScope,
          dueDate: { gte: rangeStart, lte: rangeEnd },
        },
        _sum: { payValue: true },
      }),

      // 7. Status distribution — count + R$ value per status (donut chart)
      prisma.payable.groupBy({
        by: ["status"],
        where: {
          ...tenantScope,
          dueDate: { gte: rangeStart, lte: rangeEnd },
        },
        _count: true,
        _sum: { payValue: true },
      }),

      // 8. Top 10 suppliers by payValue (horizontal bar chart)
      prisma.payable.groupBy({
        by: ["supplierId"],
        where: {
          ...tenantScope,
          dueDate: { gte: rangeStart, lte: rangeEnd },
        },
        _sum: { payValue: true },
        orderBy: { _sum: { payValue: "desc" } },
        take: 10,
      }),

      // 9. A Vencer no Período — active payables (PENDING/APPROVED) due in the range
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          status: { in: [...activeStatuses] },
          dueDate: { gte: rangeStart, lte: rangeEnd },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 10. Segurado no Período — payables tagged "segurado" due in the range
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          tags: { has: "segurado" },
          dueDate: { gte: rangeStart, lte: rangeEnd },
        },
        _sum: { payValue: true },
        _count: true,
      }),
    ]);

    // Batch 2: deltas, sparklines, budget gauge, weekly calendar
    const [
      prevPaid,
      prevDueInPeriod,
      prevInsured,
      paidSparklineRaw,
      insuredSparklineRaw,
      budgetRaw,
      weeklyCalendarRaw,
      tenantSettings,
    ] = await Promise.all([
      // 11. Previous period — paid (for delta comparison)
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          status: "PAID",
          paidAt: { gte: prevRangeStart, lte: prevRangeEnd },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 12. Previous period — dueInPeriod (for delta comparison)
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          status: { in: [...activeStatuses] },
          dueDate: { gte: prevRangeStart, lte: prevRangeEnd },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 13. Previous period — insuredInPeriod (for delta comparison)
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          tags: { has: "segurado" },
          dueDate: { gte: prevRangeStart, lte: prevRangeEnd },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 14. Sparkline — daily paid amounts (findMany because paidAt is DateTime)
      prisma.payable.findMany({
        where: {
          ...tenantScope,
          status: "PAID",
          paidAt: { gte: rangeStart, lte: rangeEnd },
        },
        select: { paidAt: true, payValue: true },
      }),

      // 15. Sparkline — daily insured amounts
      prisma.payable.groupBy({
        by: ["dueDate"],
        where: {
          ...tenantScope,
          tags: { has: "segurado" },
          dueDate: { gte: rangeStart, lte: rangeEnd },
        },
        _sum: { payValue: true },
      }),

      // 16. PENDING payables due this week — for buyer budget gauge (#84)
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          status: "PENDING",
          dueDate: { gte: currentWeekStart, lte: currentWeekEnd },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 17. Active payables grouped by dueDate — for weekly calendar (#84)
      // Includes both PENDING and APPROVED so we can classify overdue vs pending
      prisma.payable.groupBy({
        by: ["dueDate"],
        where: {
          ...tenantScope,
          status: { in: [...activeStatuses] },
          dueDate: { gte: currentWeekStart, lte: lastWeekEnd },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 18. Tenant spending limit (#84)
      prisma.tenantSettings.findUnique({
        where: { tenantId: ctx.tenantId },
        select: { buyerSpendingLimit: true },
      }),
    ]);

    // Calculate percentage: paid / planned * 100
    const paidSum = Number(paidThisMonth._sum.payValue ?? 0);
    const plannedSum = Number(plannedThisMonth._sum.payValue ?? 0);
    const percentOfPlan =
      plannedSum > 0 ? Math.round((paidSum / plannedSum) * 100) : 0;

    // ---- Pivot daily payments into one object per day ----
    const ALL_STATUSES = [
      "PENDING",
      "APPROVED",
      "PAID",
      "OVERDUE",
      "REJECTED",
      "CANCELLED",
    ] as const;

    const dayMap = new Map<string, DailyPaymentData>();
    for (const row of dailyRaw) {
      // dueDate is @db.Date — extract ISO date string for cross-month support
      const date = row.dueDate.toISOString().split("T")[0];
      if (!dayMap.has(date)) {
        const empty = { date } as DailyPaymentData;
        for (const s of ALL_STATUSES) empty[s] = 0;
        dayMap.set(date, empty);
      }
      const entry = dayMap.get(date)!;
      entry[row.status] = Number(row._sum.payValue ?? 0);
    }
    const dailyPayments = Array.from(dayMap.values()).sort(
      (a, b) => a.date.localeCompare(b.date),
    );

    // ---- Status distribution ----
    const statusDistribution = statusRaw.map((row) => ({
      status: row.status,
      count: row._count,
      value: Number(row._sum.payValue ?? 0),
    }));

    // ---- Top 10 suppliers — resolve names from IDs ----
    const supplierIds = topSuppliersRaw
      .map((row) => row.supplierId)
      .filter(Boolean) as string[];
    const suppliers =
      supplierIds.length > 0
        ? await prisma.supplier.findMany({
            where: { id: { in: supplierIds } },
            select: { id: true, name: true },
          })
        : [];
    const nameMap = new Map(suppliers.map((s) => [s.id, s.name]));

    // Overdue breakdown per top 10 supplier — scoped to same period as totals
    // Uses AND to combine period range (gte+lte) with overdue condition (lt today)
    const overdueBySupplier = supplierIds.length > 0
      ? await prisma.payable.groupBy({
          by: ["supplierId"],
          where: {
            ...tenantScope,
            supplierId: { in: supplierIds },
            status: { in: [...activeStatuses] },
            AND: [
              { dueDate: { gte: rangeStart, lte: rangeEnd } },
              { dueDate: { lt: today } },
            ],
          },
          _sum: { payValue: true },
          _min: { dueDate: true },
        })
      : [];
    const overdueMap = new Map(
      overdueBySupplier.map((r) => [
        r.supplierId,
        {
          overdueTotal: Number(r._sum.payValue ?? 0),
          minDueDate: r._min.dueDate,
        },
      ]),
    );

    // Paid breakdown per top 10 supplier
    const paidBySupplier = supplierIds.length > 0
      ? await prisma.payable.groupBy({
          by: ["supplierId"],
          where: {
            ...tenantScope,
            supplierId: { in: supplierIds },
            status: "PAID",
            dueDate: { gte: rangeStart, lte: rangeEnd },
          },
          _sum: { payValue: true },
        })
      : [];
    const paidMap = new Map(
      paidBySupplier.map((r) => [r.supplierId, Number(r._sum.payValue ?? 0)]),
    );

    const topSuppliers = topSuppliersRaw.map((row) => {
      const od = overdueMap.get(row.supplierId) ?? { overdueTotal: 0, minDueDate: null };
      const total = Number(row._sum.payValue ?? 0);
      const paidTotal = paidMap.get(row.supplierId) ?? 0;
      const maxDaysOverdue = od.minDueDate
        ? Math.floor((today.getTime() - od.minDueDate.getTime()) / 86_400_000)
        : 0;
      return {
        supplierId: row.supplierId,
        supplierName: row.supplierId
          ? (nameMap.get(row.supplierId) ?? "Desconhecido")
          : "Pagamentos Avulsos",
        total,
        paidTotal,
        overdueTotal: od.overdueTotal,
        maxDaysOverdue,
        urgencyTier: computeUrgencyTier({
          overdueValue: od.overdueTotal,
          totalValue: total,
          maxDaysOverdue,
        }),
      };
    });

    // ---- Build sparklines ----

    // Sparkline for paidThisMonth: group findMany results by paidAt date
    const paidByDay = new Map<string, number>();
    for (const row of paidSparklineRaw) {
      if (!row.paidAt) continue;
      const day = row.paidAt.toISOString().split("T")[0];
      paidByDay.set(day, (paidByDay.get(day) ?? 0) + Number(row.payValue ?? 0));
    }
    const paidSparkline = buildSparkline(paidByDay, rangeStart, rangeEnd);

    // Sparkline for dueInPeriod: sum PENDING + APPROVED per day from dailyPayments
    const dueSparkline = dailyPayments.map((d) => d.PENDING + d.APPROVED);

    // Sparkline for insuredInPeriod: from groupBy results
    const insuredByDay = new Map<string, number>();
    for (const row of insuredSparklineRaw) {
      const day = row.dueDate.toISOString().split("T")[0];
      insuredByDay.set(day, Number(row._sum.payValue ?? 0));
    }
    const insuredSparkline = buildSparkline(insuredByDay, rangeStart, rangeEnd);

    // ---- Compute deltas ----
    const dueInPeriodValue = Number(dueInPeriod._sum.payValue ?? 0);
    const insuredInPeriodValue = Number(insuredInPeriod._sum.payValue ?? 0);

    const paidDelta = computeDelta(paidSum, Number(prevPaid._sum.payValue ?? 0));
    const dueDelta = computeDelta(dueInPeriodValue, Number(prevDueInPeriod._sum.payValue ?? 0));
    const insuredDelta = computeDelta(insuredInPeriodValue, Number(prevInsured._sum.payValue ?? 0));

    // ---- Aging overview (computed from overdue payables) ----
    const overduePayables = await prisma.payable.findMany({
      where: {
        ...tenantScope,
        status: { in: [...activeStatuses] },
        dueDate: { lt: today },
      },
      select: { dueDate: true, payValue: true, jurosMulta: true },
    });

    const todayMs = today.getTime();
    let totalAgingDays = 0;
    let interestExposure = 0;
    let criticalCount = 0;
    const agingBrackets = [
      { key: "0-30", label: "0–30 dias", min: 0, max: 30, count: 0, value: 0, color: "#F59E0B" },
      { key: "31-60", label: "31–60 dias", min: 31, max: 60, count: 0, value: 0, color: "#F97316" },
      { key: "61-90", label: "61–90 dias", min: 61, max: 90, count: 0, value: 0, color: "#EF4444" },
      { key: "90+", label: "90+ dias", min: 91, max: Infinity, count: 0, value: 0, color: "#7F1D1D" },
    ];

    for (const p of overduePayables) {
      const days = Math.floor((todayMs - p.dueDate.getTime()) / 86_400_000);
      const val = Number(p.payValue ?? 0);
      totalAgingDays += days;
      interestExposure += Number(p.jurosMulta ?? 0);
      if (days > 90) criticalCount++;
      const bracket = agingBrackets.find((b) => days >= b.min && days <= b.max);
      if (bracket) {
        bracket.count++;
        bracket.value += val;
      }
    }

    const avgDaysOverdue =
      overduePayables.length > 0
        ? Math.round(totalAgingDays / overduePayables.length)
        : 0;

    // ---- Buyer budget gauge (#84) ----
    const totalOpen = Number(budgetRaw._sum.payValue ?? 0);
    const limit = Number(tenantSettings?.buyerSpendingLimit ?? 350000);
    const utilization = limit > 0 ? totalOpen / limit : 0;

    // Build current week label for the gauge header
    const cwsStr = currentWeekStart.toISOString().split("T")[0];
    const cweStr = currentWeekEnd.toISOString().split("T")[0];
    const weekLabel = `${cwsStr.slice(8, 10)}/${cwsStr.slice(5, 7)} – ${cweStr.slice(8, 10)}/${cweStr.slice(5, 7)}`;

    const buyerBudget: BuyerBudgetData = {
      totalOpen,
      limit,
      utilization,
      remaining: limit - totalOpen,
      status:
        utilization >= BUDGET_THRESHOLDS.yellow ? "red" :
        utilization >= BUDGET_THRESHOLDS.green ? "yellow" : "green",
      openCount: budgetRaw._count,
      weekLabel,
    };

    // ---- Weekly calendar bucketing (#84) ----
    const weeklyCalendar: WeeklyPaymentData[] = [];
    for (let i = 0; i < 5; i++) {
      const ws = addWeeks(currentWeekStart, i);
      const we = endOfWeek(ws, { weekStartsOn: 6 });
      const wsStr = ws.toISOString().split("T")[0];
      const weStr = we.toISOString().split("T")[0];
      const dd1 = wsStr.slice(8, 10), mm1 = wsStr.slice(5, 7);
      const dd2 = weStr.slice(8, 10), mm2 = weStr.slice(5, 7);
      weeklyCalendar.push({
        weekStart: wsStr,
        weekEnd: weStr,
        label: `${dd1}/${mm1} – ${dd2}/${mm2}`,
        value: 0,
        count: 0,
        isCurrent: i === 0,
        overdueValue: 0,
        overdueCount: 0,
        totalValue: 0,
        totalCount: 0,
        urgencyTier: "green",
        maxDaysOverdue: 0,
      });
    }
    for (const row of weeklyCalendarRaw) {
      const dateMs = row.dueDate.getTime();
      const bucket = weeklyCalendar.find(
        (w) =>
          dateMs >= new Date(w.weekStart + "T00:00:00.000Z").getTime() &&
          dateMs <= new Date(w.weekEnd + "T23:59:59.999Z").getTime(),
      );
      if (bucket) {
        const rowValue = Number(row._sum.payValue ?? 0);
        const isOverdue = row.dueDate < today;
        if (isOverdue) {
          bucket.overdueValue += rowValue;
          bucket.overdueCount += row._count;
          const daysOver = Math.floor((todayMs - row.dueDate.getTime()) / 86_400_000);
          if (daysOver > bucket.maxDaysOverdue) bucket.maxDaysOverdue = daysOver;
        } else {
          bucket.value += rowValue;
          bucket.count += row._count;
        }
      }
    }
    // Compute derived fields for each week bucket
    for (const bucket of weeklyCalendar) {
      bucket.totalValue = bucket.value + bucket.overdueValue;
      bucket.totalCount = bucket.count + bucket.overdueCount;
      bucket.urgencyTier = computeUrgencyTier(bucket);
    }

    // ---- Build response ----
    const response: DashboardResponse = {
      totalPayable: {
        label: "Total a Pagar",
        value: Number(totalPayable._sum.payValue ?? 0),
        count: totalPayable._count,
      },
      overdue: {
        label: "Vencidos",
        value: Number(overdue._sum.payValue ?? 0),
        count: overdue._count,
      },
      dueSoon: {
        label: "A Vencer 7 dias",
        value: Number(dueSoon._sum.payValue ?? 0),
        count: dueSoon._count,
      },
      paidThisMonth: {
        label: "Pagos no Período",
        value: paidSum,
        count: paidThisMonth._count,
        percentOfPlan,
        delta: paidDelta,
        sparkline: paidSparkline,
      },
      dueInPeriod: {
        label: "A Vencer no Período",
        value: dueInPeriodValue,
        count: dueInPeriod._count,
        delta: dueDelta,
        sparkline: dueSparkline,
      },
      insuredInPeriod: {
        label: "Segurado no Período",
        value: insuredInPeriodValue,
        count: insuredInPeriod._count,
        delta: insuredDelta,
        sparkline: insuredSparkline,
      },
      charts: {
        dailyPayments,
        statusDistribution,
        topSuppliers,
      },
      buyerBudget,
      weeklyCalendar,
      agingOverview: {
        avgDaysOverdue,
        interestExposure: Math.round(interestExposure * 100) / 100,
        criticalCount,
        agingBrackets: agingBrackets.map((b) => ({
          key: b.key,
          label: b.label,
          min: b.min,
          max: b.max === Infinity ? 9999 : b.max,
          count: b.count,
          value: Math.round(b.value * 100) / 100,
          color: b.color,
        })),
      },
    };

    // Cache dashboard data for 60s — data doesn't need to be real-time,
    // and this eliminates repeat DB hits when refreshing the page.
    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    console.error("[GET /api/dashboard] error:", err);
    const message = err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
