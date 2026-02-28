import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import type { BrandCostAnalysis, BrandCostRow } from "@/lib/ar/types";

// =============================================================================
// GET /api/ar/analytics/brands — Brand cost analysis (#73)
// =============================================================================
// Aggregates card transactions by brand for a given period, computing:
//   - gross/net/fee totals, avg fee %, transaction count
//   - avg settlement days (expectedPaymentDate - transactionDate)
// Period defaults to current calendar month. Filters by transactionDate
// (sale date), not expectedPaymentDate (payment date).
// =============================================================================

const DAY_MS = 86_400_000;

export async function GET(request: NextRequest) {
  try {
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

    const tenantScope = { tenantId: ctx.tenantId };
    const dateScope = { transactionDate: { gte: rangeStart, lte: rangeEnd } };

    // Two parallel queries: groupBy for aggregates, findMany for settlement days
    const [brandGroups, datePairs] = await Promise.all([
      prisma.cardTransaction.groupBy({
        by: ["brand"],
        where: { ...tenantScope, ...dateScope },
        _sum: { grossAmount: true, netAmount: true, feeAmount: true },
        _avg: { feePct: true },
        _count: true,
        orderBy: { _sum: { feeAmount: "desc" } },
      }),

      prisma.cardTransaction.findMany({
        where: { ...tenantScope, ...dateScope },
        select: { brand: true, transactionDate: true, expectedPaymentDate: true },
      }),
    ]);

    // Compute avg settlement days per brand
    const settlementMap = new Map<string, number[]>();
    for (const row of datePairs) {
      const days = Math.round(
        (row.expectedPaymentDate.getTime() - row.transactionDate.getTime()) / DAY_MS,
      );
      const arr = settlementMap.get(row.brand) ?? [];
      arr.push(days);
      settlementMap.set(row.brand, arr);
    }

    function avgSettlement(brand: string): number {
      const days = settlementMap.get(brand);
      if (!days || days.length === 0) return 0;
      return Math.round(days.reduce((a, b) => a + b, 0) / days.length);
    }

    // Build response
    let feesGrandTotal = 0;
    const brands: BrandCostRow[] = brandGroups.map((g) => {
      const feesTotal = Number(g._sum.feeAmount ?? 0);
      feesGrandTotal += feesTotal;
      return {
        brand: g.brand,
        transactionCount: g._count,
        grossTotal: (g._sum.grossAmount ?? 0).toString(),
        netTotal: (g._sum.netAmount ?? 0).toString(),
        feesTotal: feesTotal.toString(),
        avgFeePct: Number(g._avg.feePct ?? 0).toFixed(2),
        avgSettlementDays: avgSettlement(g.brand),
      };
    });

    const response: BrandCostAnalysis = {
      brands,
      feesGrandTotal: feesGrandTotal.toFixed(2),
      periodFrom: fromParam,
      periodTo: toParam,
    };

    return NextResponse.json({ data: response });
  } catch (err) {
    console.error("[GET /api/ar/analytics/brands] error:", err);
    const message = err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
