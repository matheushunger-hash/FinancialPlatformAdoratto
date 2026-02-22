import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import type { DashboardKPIs } from "@/lib/dashboard/types";

// =============================================================================
// GET /api/dashboard — Financial KPI aggregations
// =============================================================================
// Returns 4 KPI cards for the dashboard: Total a Pagar, Vencidos,
// A Vencer 7 dias, and Pagos no Mês. All queries are scoped by tenantId.
//
// Query params:
//   month (1–12) — defaults to current month
//   year (e.g. 2026) — defaults to current year
// =============================================================================

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse month/year from query params, defaulting to current date
  const { searchParams } = new URL(request.url);
  const now = new Date();
  const month = Math.min(12, Math.max(1, Number(searchParams.get("month")) || now.getMonth() + 1));
  const year = Number(searchParams.get("year")) || now.getFullYear();

  // Build date boundaries
  // "today" at midnight local time — used for overdue/due-soon comparisons
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 7 days from now (end of day) — upper bound for "due soon"
  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  sevenDaysFromNow.setHours(23, 59, 59, 999);

  // First and last instant of the selected month — for "Pagos no Mês"
  const monthStart = new Date(year, month - 1, 1); // 1st of month at 00:00
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999); // last day at 23:59

  // Common filter: only this tenant, only active statuses (not yet paid/cancelled)
  const activeStatuses = ["PENDING", "APPROVED"] as const;
  const tenantScope = { tenantId: ctx.tenantId };

  try {
    // Run all 5 queries in parallel for best performance
    // (5 queries because "Pagos no Mês" needs a denominator for the percentage)
    const [totalPayable, overdue, dueSoon, paidThisMonth, plannedThisMonth] =
      await Promise.all([
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

        // 4. Pagos no Mês — status PAID, paidAt within the selected month
        prisma.payable.aggregate({
          where: {
            ...tenantScope,
            status: "PAID",
            paidAt: { gte: monthStart, lte: monthEnd },
          },
          _sum: { payValue: true },
          _count: true,
        }),

        // 5. Planned for the month (denominator for %) — all payables with
        //    dueDate in the selected month, regardless of status
        prisma.payable.aggregate({
          where: {
            ...tenantScope,
            dueDate: { gte: monthStart, lte: monthEnd },
          },
          _sum: { payValue: true },
        }),
      ]);

    // Calculate percentage: paid / planned * 100
    const paidSum = Number(paidThisMonth._sum.payValue ?? 0);
    const plannedSum = Number(plannedThisMonth._sum.payValue ?? 0);
    const percentOfPlan = plannedSum > 0 ? Math.round((paidSum / plannedSum) * 100) : 0;

    const response: DashboardKPIs = {
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
        label: "Pagos no Mês",
        value: paidSum,
        count: paidThisMonth._count,
        percentOfPlan,
      },
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[GET /api/dashboard] error:", err);
    const message = err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
