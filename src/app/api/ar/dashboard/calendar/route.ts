import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import type { CalendarDay, CalendarDayBrand, CalendarResponse } from "@/lib/ar/types";

// =============================================================================
// GET /api/ar/dashboard/calendar — 30-day receivable calendar (#74)
// =============================================================================
// Returns per-day aggregates of expected receivables with status bucketing and
// brand breakdown. Used by the <ReceivableCalendar /> timeline component.
// =============================================================================

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ---- Parse date range (default: today → today + 29 = 30 days) ----
    const { searchParams } = req.nextUrl;
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    const fromParam = searchParams.get("from") || todayStr;
    const toParam = searchParams.get("to") || (() => {
      const d = new Date(todayStr + "T12:00:00");
      d.setDate(d.getDate() + 29);
      return d.toISOString().split("T")[0];
    })();

    const rangeStart = new Date(fromParam + "T00:00:00.000Z");
    const rangeEnd = new Date(toParam + "T23:59:59.999Z");

    const tenantScope = { tenantId: ctx.tenantId };

    // ---- Two parallel groupBy queries ----
    const [byDateStatus, byDateBrand] = await Promise.all([
      // 1. Group by date + status → status-bucketed sums
      prisma.cardTransaction.groupBy({
        by: ["expectedPaymentDate", "status"],
        where: {
          ...tenantScope,
          status: { not: "CANCELLED" },
          expectedPaymentDate: { gte: rangeStart, lte: rangeEnd },
        },
        _sum: { netAmount: true },
        _count: true,
      }),

      // 2. Group by date + brand → brand breakdown
      prisma.cardTransaction.groupBy({
        by: ["expectedPaymentDate", "brand"],
        where: {
          ...tenantScope,
          status: { not: "CANCELLED" },
          expectedPaymentDate: { gte: rangeStart, lte: rangeEnd },
        },
        _sum: { netAmount: true },
        _count: true,
        orderBy: { _sum: { netAmount: "desc" } },
      }),
    ]);

    // ---- Merge into CalendarDay[] ----

    // Build a Map<dateKey, { pending, confirmed, overdue, total, count }>
    const dayMap = new Map<
      string,
      {
        pendingAmount: number;
        confirmedAmount: number;
        overdueAmount: number;
        totalAmount: number;
        transactionCount: number;
      }
    >();

    for (const row of byDateStatus) {
      const dayKey = row.expectedPaymentDate.toISOString().split("T")[0];
      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, {
          pendingAmount: 0,
          confirmedAmount: 0,
          overdueAmount: 0,
          totalAmount: 0,
          transactionCount: 0,
        });
      }
      const entry = dayMap.get(dayKey)!;
      const amount = Number(row._sum.netAmount ?? 0);
      const count = row._count;

      entry.totalAmount += amount;
      entry.transactionCount += count;

      switch (row.status) {
        case "PENDING":
          entry.pendingAmount += amount;
          break;
        case "CONFIRMED":
        case "DIVERGENT":
          entry.confirmedAmount += amount;
          break;
        case "OVERDUE":
          entry.overdueAmount += amount;
          break;
      }
    }

    // Build a Map<dateKey, CalendarDayBrand[]>
    const brandMap = new Map<string, CalendarDayBrand[]>();

    for (const row of byDateBrand) {
      const dayKey = row.expectedPaymentDate.toISOString().split("T")[0];
      if (!brandMap.has(dayKey)) {
        brandMap.set(dayKey, []);
      }
      brandMap.get(dayKey)!.push({
        brand: row.brand,
        netAmount: (row._sum.netAmount ?? 0).toString(),
        count: row._count,
      });
    }

    // Assemble CalendarDay[] — only include days that have transactions
    const days: CalendarDay[] = [];

    for (const [dateKey, entry] of dayMap) {
      days.push({
        date: dateKey,
        totalAmount: entry.totalAmount.toFixed(2),
        pendingAmount: entry.pendingAmount.toFixed(2),
        confirmedAmount: entry.confirmedAmount.toFixed(2),
        overdueAmount: entry.overdueAmount.toFixed(2),
        transactionCount: entry.transactionCount,
        byBrand: brandMap.get(dateKey) ?? [],
      });
    }

    // Sort by date ascending
    days.sort((a, b) => a.date.localeCompare(b.date));

    const response: CalendarResponse = {
      days,
      from: fromParam,
      to: toParam,
    };

    return NextResponse.json({ data: response });
  } catch (err) {
    console.error("[GET /api/ar/dashboard/calendar] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
