import { NextRequest, NextResponse } from "next/server";
import { startOfWeek, endOfWeek, addWeeks } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { computeDisplayStatus } from "@/lib/payables/status";
import type { DisplayStatus } from "@/lib/payables/status";
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
// All queries now use actionStatus instead of the old status enum.
//   "active" = actionStatus IS NULL (temporal) or APPROVED
//   "overdue" = actionStatus IS NULL AND dueDate < today
//   "paid" = actionStatus = PAID
//   "held" = actionStatus = HELD
// =============================================================================

const BUDGET_THRESHOLDS = { green: 0.80, yellow: 0.95 };

function computeDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

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

function computeUrgencyTier(w: { overdueValue: number; totalValue: number; maxDaysOverdue: number }): UrgencyTier {
  if (w.overdueValue === 0) return "green";
  const ratio = w.totalValue > 0 ? w.overdueValue / w.totalValue : 0;
  if (ratio > 0.5 || w.maxDaysOverdue > 60) return "red";
  if (ratio > 0.2 || w.maxDaysOverdue > 30) return "orange";
  return "yellow";
}

// "Active" means: no action taken (temporal) or approved — still needs to be paid
const ACTIVE_WHERE = {
  OR: [
    { actionStatus: null },
    { actionStatus: "APPROVED" as const },
  ],
};

// Exclude cancelled payables from all dashboard queries
const NOT_CANCELLED = {
  actionStatus: { not: "CANCELLED" as const },
};

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const defaultTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const fromParam = searchParams.get("from") || defaultFrom;
  const toParam = searchParams.get("to") || defaultTo;

  const rangeStart = new Date(fromParam + "T00:00:00.000Z");
  const rangeEnd = new Date(toParam + "T23:59:59.999Z");

  const periodMs = rangeEnd.getTime() - rangeStart.getTime();
  const prevRangeEnd = new Date(rangeStart.getTime() - 1);
  prevRangeEnd.setUTCHours(23, 59, 59, 999);
  const prevRangeStart = new Date(rangeStart.getTime() - periodMs - 86400000);
  prevRangeStart.setUTCHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  sevenDaysFromNow.setHours(23, 59, 59, 999);

  const currentWeekStart = startOfWeek(today, { weekStartsOn: 6 });
  const currentWeekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 6 });
  const lastWeekEnd = endOfWeek(addWeeks(currentWeekStart, 4), { weekStartsOn: 6 });

  const tenantScope = { tenantId: ctx.tenantId };

  try {
    // Batch 1: core KPIs + chart data
    const [
      totalPayable,
      overdue,
      dueSoon,
      paidThisMonth,
      plannedThisMonth,
      dailyRaw,
      topSuppliersRaw,
      dueInPeriod,
      insuredInPeriod,
    ] = await Promise.all([
      // 1. Total a Pagar — actionStatus IS NULL OR APPROVED
      prisma.payable.aggregate({
        where: { ...tenantScope, ...ACTIVE_WHERE },
        _sum: { payValue: true },
        _count: true,
      }),

      // 2. Vencidos — actionStatus IS NULL AND dueDate < today
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          actionStatus: null,
          dueDate: { lt: today },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 3. A Vencer 7 dias — actionStatus IS NULL AND dueDate between today and +7d
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          actionStatus: null,
          dueDate: { gte: today, lte: sevenDaysFromNow },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 4. Pagos no Período — actionStatus = PAID, paidAt in range
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          actionStatus: "PAID",
          paidAt: { gte: rangeStart, lte: rangeEnd },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 5. Planned for the period (denominator for %)
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          ...NOT_CANCELLED,
          dueDate: { gte: rangeStart, lte: rangeEnd },
        },
        _sum: { payValue: true },
      }),

      // 6. Daily payments — grouped by dueDate + actionStatus for stacked bar
      prisma.payable.groupBy({
        by: ["dueDate", "actionStatus"],
        where: {
          ...tenantScope,
          ...NOT_CANCELLED,
          dueDate: { gte: rangeStart, lte: rangeEnd },
        },
        _sum: { payValue: true },
      }),

      // 7. Top 10 suppliers by payValue
      prisma.payable.groupBy({
        by: ["supplierId"],
        where: {
          ...tenantScope,
          ...NOT_CANCELLED,
          dueDate: { gte: rangeStart, lte: rangeEnd },
        },
        _sum: { payValue: true },
        _count: true,
        orderBy: { _sum: { payValue: "desc" } },
        take: 10,
      }),

      // 8. A Vencer no Período — active payables due in range
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          ...ACTIVE_WHERE,
          dueDate: { gte: rangeStart, lte: rangeEnd },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 9. Segurado no Período — actionStatus = HELD, due in range
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          actionStatus: "HELD",
          dueDate: { gte: rangeStart, lte: rangeEnd },
        },
        _sum: { payValue: true },
        _count: true,
      }),
    ]);

    // Batch 2: deltas, sparklines, budget, weekly calendar
    const [
      prevPaid,
      prevDueInPeriod,
      prevInsured,
      paidSparklineRaw,
      insuredSparklineRaw,
      budgetPendingRaw,
      budgetOverdueRaw,
      budgetPaidRaw,
      weeklyCalendarRaw,
      weeklyPaidRaw,
      tenantSettings,
      weeklyTopSuppliersRaw,
      weeklyGrandTotalRaw,
    ] = await Promise.all([
      // 11. Previous period — paid
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          actionStatus: "PAID",
          paidAt: { gte: prevRangeStart, lte: prevRangeEnd },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 12. Previous period — dueInPeriod
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          ...ACTIVE_WHERE,
          dueDate: { gte: prevRangeStart, lte: prevRangeEnd },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 13. Previous period — insured
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          actionStatus: "HELD",
          dueDate: { gte: prevRangeStart, lte: prevRangeEnd },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 14. Sparkline — daily paid amounts
      prisma.payable.findMany({
        where: {
          ...tenantScope,
          actionStatus: "PAID",
          paidAt: { gte: rangeStart, lte: rangeEnd },
        },
        select: { paidAt: true, payValue: true },
      }),

      // 15. Sparkline — daily held amounts
      prisma.payable.groupBy({
        by: ["dueDate"],
        where: {
          ...tenantScope,
          actionStatus: "HELD",
          dueDate: { gte: rangeStart, lte: rangeEnd },
        },
        _sum: { payValue: true },
      }),

      // 16a. Active non-overdue payables due this week
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          actionStatus: null,
          dueDate: { gte: today, lte: currentWeekEnd },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 16b. Overdue active payables due this week
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          actionStatus: null,
          dueDate: { gte: currentWeekStart, lt: today },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 16c. Paid payables due this week
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          actionStatus: "PAID",
          dueDate: { gte: currentWeekStart, lte: currentWeekEnd },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 17a. Active payables grouped by dueDate — weekly calendar
      prisma.payable.groupBy({
        by: ["dueDate"],
        where: {
          ...tenantScope,
          actionStatus: null,
          dueDate: { gte: currentWeekStart, lte: lastWeekEnd },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 17b. Paid payables grouped by dueDate — weekly calendar
      prisma.payable.groupBy({
        by: ["dueDate"],
        where: {
          ...tenantScope,
          actionStatus: "PAID",
          dueDate: { gte: currentWeekStart, lte: lastWeekEnd },
        },
        _sum: { payValue: true },
        _count: true,
      }),

      // 18. Tenant spending limit
      prisma.tenantSettings.findUnique({
        where: { tenantId: ctx.tenantId },
        select: { buyerSpendingLimit: true },
      }),

      // 19. Top 10 suppliers in current week (all non-cancelled)
      prisma.payable.groupBy({
        by: ["supplierId"],
        where: {
          ...tenantScope,
          ...NOT_CANCELLED,
          dueDate: { gte: currentWeekStart, lte: currentWeekEnd },
        },
        _sum: { payValue: true },
        _count: true,
        orderBy: { _sum: { payValue: "desc" } },
        take: 10,
      }),

      // 20. Grand total payValue in current week
      prisma.payable.aggregate({
        where: {
          ...tenantScope,
          OR: [
            { actionStatus: null },
            { actionStatus: "APPROVED" },
            { actionStatus: "PAID" },
          ],
          dueDate: { gte: currentWeekStart, lte: currentWeekEnd },
        },
        _sum: { payValue: true },
      }),
    ]);

    const paidSum = Number(paidThisMonth._sum.payValue ?? 0);
    const plannedSum = Number(plannedThisMonth._sum.payValue ?? 0);
    const percentOfPlan =
      plannedSum > 0 ? Math.round((paidSum / plannedSum) * 100) : 0;

    // ---- Pivot daily payments by display status ----
    const ALL_DISPLAY_STATUSES: DisplayStatus[] = [
      "A_VENCER", "VENCE_HOJE", "VENCIDO", "APROVADO", "SEGURADO", "PAGO", "PROTESTADO", "CANCELADO",
    ];

    const dayMap = new Map<string, DailyPaymentData>();
    for (const row of dailyRaw) {
      const date = row.dueDate.toISOString().split("T")[0];
      if (!dayMap.has(date)) {
        const empty = { date } as DailyPaymentData;
        for (const s of ALL_DISPLAY_STATUSES) empty[s] = 0;
        dayMap.set(date, empty);
      }
      const entry = dayMap.get(date)!;
      // Compute display status for this group
      const ds = computeDisplayStatus(row.actionStatus, row.dueDate);
      entry[ds] += Number(row._sum.payValue ?? 0);
    }
    const dailyPayments = Array.from(dayMap.values()).sort(
      (a, b) => a.date.localeCompare(b.date),
    );

    // ---- Status distribution (donut) — group by display status ----
    // We need to fetch raw payables in the range to compute display status
    const distributionRaw = await prisma.payable.findMany({
      where: {
        ...tenantScope,
        ...NOT_CANCELLED,
        dueDate: { gte: rangeStart, lte: rangeEnd },
      },
      select: { actionStatus: true, dueDate: true, payValue: true },
    });

    const distMap = new Map<DisplayStatus, { count: number; value: number }>();
    for (const p of distributionRaw) {
      const ds = computeDisplayStatus(p.actionStatus, p.dueDate);
      const existing = distMap.get(ds) ?? { count: 0, value: 0 };
      existing.count++;
      existing.value += Number(p.payValue ?? 0);
      distMap.set(ds, existing);
    }
    const statusDistribution = Array.from(distMap.entries()).map(([status, data]) => ({
      status,
      count: data.count,
      value: Math.round(data.value * 100) / 100,
    }));

    // ---- Top 10 suppliers ----
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

    const overdueBySupplier = supplierIds.length > 0
      ? await prisma.payable.groupBy({
          by: ["supplierId"],
          where: {
            ...tenantScope,
            supplierId: { in: supplierIds },
            actionStatus: null,
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

    const paidBySupplier = supplierIds.length > 0
      ? await prisma.payable.groupBy({
          by: ["supplierId"],
          where: {
            ...tenantScope,
            supplierId: { in: supplierIds },
            actionStatus: "PAID",
            dueDate: { gte: rangeStart, lte: rangeEnd },
          },
          _sum: { payValue: true },
        })
      : [];
    const paidMap = new Map(
      paidBySupplier.map((r) => [r.supplierId, Number(r._sum.payValue ?? 0)]),
    );

    const todayMs = today.getTime();

    const topSuppliers = topSuppliersRaw.map((row) => {
      const od = overdueMap.get(row.supplierId) ?? { overdueTotal: 0, minDueDate: null };
      const total = Number(row._sum.payValue ?? 0);
      const paidTotal = paidMap.get(row.supplierId) ?? 0;
      const maxDaysOverdue = od.minDueDate
        ? Math.floor((todayMs - od.minDueDate.getTime()) / 86_400_000)
        : 0;
      return {
        supplierId: row.supplierId,
        supplierName: row.supplierId
          ? (nameMap.get(row.supplierId) ?? "Desconhecido")
          : "Pagamentos Avulsos",
        total,
        count: row._count,
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

    // ---- Sparklines ----
    const paidByDay = new Map<string, number>();
    for (const row of paidSparklineRaw) {
      if (!row.paidAt) continue;
      const day = row.paidAt.toISOString().split("T")[0];
      paidByDay.set(day, (paidByDay.get(day) ?? 0) + Number(row.payValue ?? 0));
    }
    const paidSparkline = buildSparkline(paidByDay, rangeStart, rangeEnd);

    // Sparkline for dueInPeriod: sum temporal statuses per day
    const dueSparkline = dailyPayments.map((d) => d.A_VENCER + d.VENCE_HOJE + d.VENCIDO + d.APROVADO);

    const insuredByDay = new Map<string, number>();
    for (const row of insuredSparklineRaw) {
      const day = row.dueDate.toISOString().split("T")[0];
      insuredByDay.set(day, Number(row._sum.payValue ?? 0));
    }
    const insuredSparkline = buildSparkline(insuredByDay, rangeStart, rangeEnd);

    // ---- Deltas ----
    const dueInPeriodValue = Number(dueInPeriod._sum.payValue ?? 0);
    const insuredInPeriodValue = Number(insuredInPeriod._sum.payValue ?? 0);

    const paidDelta = computeDelta(paidSum, Number(prevPaid._sum.payValue ?? 0));
    const dueDelta = computeDelta(dueInPeriodValue, Number(prevDueInPeriod._sum.payValue ?? 0));
    const insuredDelta = computeDelta(insuredInPeriodValue, Number(prevInsured._sum.payValue ?? 0));

    // ---- Aging overview ----
    const overduePayables = await prisma.payable.findMany({
      where: {
        ...tenantScope,
        actionStatus: null,
        dueDate: { lt: today },
      },
      select: { dueDate: true, payValue: true, jurosMulta: true },
    });

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

    // ---- Buyer budget gauge ----
    const pendingOpen = Number(budgetPendingRaw._sum.payValue ?? 0);
    const overdueOpen = Number(budgetOverdueRaw._sum.payValue ?? 0);
    const paidInWeek = Number(budgetPaidRaw._sum.payValue ?? 0);
    const totalOpen = pendingOpen + overdueOpen + paidInWeek;
    const limit = Number(tenantSettings?.buyerSpendingLimit ?? 350000);
    const utilization = limit > 0 ? totalOpen / limit : 0;

    const cwsStr = currentWeekStart.toISOString().split("T")[0];
    const cweStr = currentWeekEnd.toISOString().split("T")[0];
    const weekLabel = `${cwsStr.slice(8, 10)}/${cwsStr.slice(5, 7)} – ${cweStr.slice(8, 10)}/${cweStr.slice(5, 7)}`;

    const rawStatus: "green" | "yellow" | "red" =
      utilization >= BUDGET_THRESHOLDS.yellow ? "red" :
      utilization >= BUDGET_THRESHOLDS.green ? "yellow" : "green";

    const buyerBudget: BuyerBudgetData = {
      totalOpen,
      limit,
      utilization,
      remaining: limit - totalOpen,
      status: rawStatus,
      openCount: budgetPendingRaw._count,
      overdueOpen,
      overdueCount: budgetOverdueRaw._count,
      paidInWeek,
      paidInWeekCount: budgetPaidRaw._count,
      weekLabel,
      weekStart: cwsStr,
      weekEnd: cweStr,
    };

    // ---- Weekly calendar ----
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
        paidValue: 0,
        paidCount: 0,
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
    for (const row of weeklyPaidRaw) {
      const dateMs = row.dueDate.getTime();
      const bucket = weeklyCalendar.find(
        (w) =>
          dateMs >= new Date(w.weekStart + "T00:00:00.000Z").getTime() &&
          dateMs <= new Date(w.weekEnd + "T23:59:59.999Z").getTime(),
      );
      if (bucket) {
        bucket.paidValue += Number(row._sum.payValue ?? 0);
        bucket.paidCount += row._count;
      }
    }
    for (const bucket of weeklyCalendar) {
      bucket.totalValue = bucket.value + bucket.overdueValue + bucket.paidValue;
      bucket.totalCount = bucket.count + bucket.overdueCount + bucket.paidCount;
      bucket.urgencyTier = computeUrgencyTier(bucket);
    }

    // ---- Weekly top suppliers ----
    const weeklySupplierIds = weeklyTopSuppliersRaw
      .map((r) => r.supplierId)
      .filter(Boolean) as string[];
    const missingIds = weeklySupplierIds.filter((id) => !nameMap.has(id));
    if (missingIds.length > 0) {
      const extra = await prisma.supplier.findMany({
        where: { id: { in: missingIds } },
        select: { id: true, name: true },
      });
      for (const s of extra) nameMap.set(s.id, s.name);
    }

    const weeklyTopSuppliers = {
      suppliers: weeklyTopSuppliersRaw.map((row) => ({
        supplierId: row.supplierId,
        supplierName: row.supplierId
          ? (nameMap.get(row.supplierId) ?? "Desconhecido")
          : "Pagamentos Avulsos",
        total: Number(row._sum.payValue ?? 0),
        count: row._count,
        paidTotal: 0,
        overdueTotal: 0,
        maxDaysOverdue: 0,
        urgencyTier: "green" as const,
      })),
      grandTotal: Number(weeklyGrandTotalRaw._sum.payValue ?? 0),
    };

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
      weeklyTopSuppliers,
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
