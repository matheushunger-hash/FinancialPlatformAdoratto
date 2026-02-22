import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import type {
  DashboardResponse,
  DailyPaymentData,
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

  // Common filter: only this tenant, only active statuses (not yet paid/cancelled)
  const activeStatuses = ["PENDING", "APPROVED"] as const;
  const tenantScope = { tenantId: ctx.tenantId };

  try {
    // Run all 15 queries in parallel for best performance
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
      // Previous period deltas (queries 11-13)
      prevPaid,
      prevDueInPeriod,
      prevInsured,
      // Sparkline data (queries 14-15)
      paidSparklineRaw,
      insuredSparklineRaw,
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

      // 7. Status distribution — count of payables per status (donut chart)
      prisma.payable.groupBy({
        by: ["status"],
        where: {
          ...tenantScope,
          dueDate: { gte: rangeStart, lte: rangeEnd },
        },
        _count: true,
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
    }));

    // ---- Top 10 suppliers — resolve names from IDs ----
    const supplierIds = topSuppliersRaw.map((row) => row.supplierId);
    const suppliers =
      supplierIds.length > 0
        ? await prisma.supplier.findMany({
            where: { id: { in: supplierIds } },
            select: { id: true, name: true },
          })
        : [];
    const nameMap = new Map(suppliers.map((s) => [s.id, s.name]));

    const topSuppliers = topSuppliersRaw.map((row) => ({
      supplierName: nameMap.get(row.supplierId) ?? "Desconhecido",
      total: Number(row._sum.payValue ?? 0),
    }));

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
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[GET /api/dashboard] error:", err);
    const message = err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
