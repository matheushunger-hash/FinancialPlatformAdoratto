import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import type { ARDashboardSummary } from "@/lib/ar/types";

// Compute % change between current and previous values (one decimal precision)
function computeDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100 * 10) / 10;
}

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantScope = { tenantId: ctx.tenantId };

    // ---- Date boundaries (all UTC to prevent timezone drift) ----

    // Today — midnight to end of day
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const todayStart = new Date(todayStr + "T00:00:00.000Z");
    const todayEnd = new Date(todayStr + "T23:59:59.999Z");

    // Next 7 days — from today to 7 days out (end of day)
    const sevenDaysOut = new Date(todayStart);
    sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
    const sevenDaysEnd = new Date(
      sevenDaysOut.toISOString().split("T")[0] + "T23:59:59.999Z",
    );

    // Current month — first day to last day
    const monthStart = new Date(`${todayStr.slice(0, 7)}-01T00:00:00.000Z`);
    const nextMonth = new Date(monthStart);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthEnd = new Date(nextMonth.getTime() - 1);

    // Current week (Mon–Sun) and previous week for delta
    const dayOfWeek = now.getUTCDay(); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(todayStr + "T00:00:00.000Z");
    weekStart.setDate(weekStart.getDate() + mondayOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndBoundary = new Date(
      weekEnd.toISOString().split("T")[0] + "T23:59:59.999Z",
    );

    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(weekStart.getTime() - 1);

    // ---- 7 parallel queries ----
    const [
      totalPending,
      receivableToday,
      next7Days,
      feesThisMonth,
      overdueCount,
      currentWeekNet,
      prevWeekNet,
    ] = await Promise.all([
      // 1. Total Pending — all PENDING transactions
      prisma.cardTransaction.aggregate({
        where: { ...tenantScope, status: "PENDING" },
        _sum: { netAmount: true },
        _count: true,
      }),

      // 2. Receivable Today — PENDING or CONFIRMED with expectedPaymentDate = today
      prisma.cardTransaction.aggregate({
        where: {
          ...tenantScope,
          status: { in: ["PENDING", "CONFIRMED"] },
          expectedPaymentDate: { gte: todayStart, lte: todayEnd },
        },
        _sum: { netAmount: true },
        _count: true,
      }),

      // 3. Next 7 Days — PENDING with expectedPaymentDate in the next 7 days
      prisma.cardTransaction.aggregate({
        where: {
          ...tenantScope,
          status: "PENDING",
          expectedPaymentDate: { gte: todayStart, lte: sevenDaysEnd },
        },
        _sum: { netAmount: true },
        _count: true,
      }),

      // 4. Fees This Month — sum of feeAmount + avg feePct for current calendar month
      // Uses transactionDate (when the sale happened), not expectedPaymentDate
      prisma.cardTransaction.aggregate({
        where: {
          ...tenantScope,
          transactionDate: { gte: monthStart, lte: monthEnd },
        },
        _sum: { feeAmount: true },
        _avg: { feePct: true },
      }),

      // 5. Overdue Count — transactions past due without deposit confirmation
      prisma.cardTransaction.count({
        where: { ...tenantScope, status: "OVERDUE" },
      }),

      // 6. Current Week — PENDING net total for week-over-week delta
      prisma.cardTransaction.aggregate({
        where: {
          ...tenantScope,
          status: "PENDING",
          expectedPaymentDate: { gte: weekStart, lte: weekEndBoundary },
        },
        _sum: { netAmount: true },
      }),

      // 7. Previous Week — PENDING net total for week-over-week delta
      prisma.cardTransaction.aggregate({
        where: {
          ...tenantScope,
          status: "PENDING",
          expectedPaymentDate: { gte: prevWeekStart, lte: prevWeekEnd },
        },
        _sum: { netAmount: true },
      }),
    ]);

    // ---- Assemble response ----
    const delta = computeDelta(
      Number(currentWeekNet._sum.netAmount ?? 0),
      Number(prevWeekNet._sum.netAmount ?? 0),
    );

    const summary: ARDashboardSummary = {
      totalPending: {
        amount: (totalPending._sum.netAmount ?? 0).toString(),
        count: totalPending._count,
      },
      receivableToday: {
        amount: (receivableToday._sum.netAmount ?? 0).toString(),
        count: receivableToday._count,
      },
      next7Days: {
        amount: (next7Days._sum.netAmount ?? 0).toString(),
        count: next7Days._count,
      },
      feesThisMonth: {
        amount: (feesThisMonth._sum.feeAmount ?? 0).toString(),
        avgPct: (feesThisMonth._avg.feePct ?? 0).toString(),
      },
      overdueCount,
      weekOverWeekPct: delta > 0 ? `+${delta}` : `${delta}`,
    };

    return NextResponse.json({ data: summary });
  } catch (err) {
    console.error("[GET /api/ar/dashboard/summary] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
