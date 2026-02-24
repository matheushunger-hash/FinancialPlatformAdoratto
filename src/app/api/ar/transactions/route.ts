import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import type { TransactionsListResponse } from "@/lib/ar/types";

// Valid statuses for the filter whitelist — unknown values are silently ignored
const VALID_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "DIVERGENT",
  "OVERDUE",
  "CANCELLED",
];

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sort whitelist — prevents injection. Unknown sort values fall back to default.
type PrismaOrder = Record<string, unknown>;
const SORT_MAP: Record<string, (order: "asc" | "desc") => PrismaOrder> = {
  expectedPaymentDate: (order) => ({ expectedPaymentDate: order }),
  transactionDate: (order) => ({ transactionDate: order }),
  brand: (order) => ({ brand: order }),
  acquirer: (order) => ({ acquirer: order }),
  grossAmount: (order) => ({ grossAmount: order }),
  netAmount: (order) => ({ netAmount: order }),
  status: (order) => ({ status: order }),
};

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(
      50,
      Math.max(1, Number(searchParams.get("pageSize")) || 25),
    );

    // Sorting — default to expectedPaymentDate desc (upcoming payments first)
    const sortParam = searchParams.get("sort") || "expectedPaymentDate";
    const orderParam =
      searchParams.get("order") === "asc" ? "asc" : ("desc" as const);
    const buildOrderBy =
      SORT_MAP[sortParam] ?? SORT_MAP.expectedPaymentDate;
    const orderBy = buildOrderBy(orderParam);

    // Build combined WHERE clause — each active filter pushes a condition.
    // All conditions are ANDed: search "Ticket" + status PENDING → both must match.
    const conditions: Record<string, unknown>[] = [];

    // Search — across transactionId, brand, acquirer, nsu (OR)
    const searchTerm = searchParams.get("search")?.trim() || "";
    if (searchTerm) {
      conditions.push({
        OR: [
          { transactionId: { contains: searchTerm, mode: "insensitive" } },
          { brand: { contains: searchTerm, mode: "insensitive" } },
          { acquirer: { contains: searchTerm, mode: "insensitive" } },
          { nsu: { contains: searchTerm, mode: "insensitive" } },
        ],
      });
    }

    // Filters — validated against whitelists, unknown values silently ignored
    const statusParam = searchParams.get("status") || "";
    if (VALID_STATUSES.includes(statusParam)) {
      conditions.push({ status: statusParam });
    }

    const brandParam = searchParams.get("brand")?.trim() || "";
    if (brandParam) {
      conditions.push({
        brand: { contains: brandParam, mode: "insensitive" },
      });
    }

    const acquirerParam = searchParams.get("acquirer")?.trim() || "";
    if (acquirerParam) {
      conditions.push({
        acquirer: { contains: acquirerParam, mode: "insensitive" },
      });
    }

    // Date range — use explicit UTC (Z suffix) so server timezone doesn't shift boundaries
    const fromParam = searchParams.get("from") || "";
    if (fromParam) {
      conditions.push({
        expectedPaymentDate: {
          gte: new Date(fromParam + "T00:00:00.000Z"),
        },
      });
    }

    const toParam = searchParams.get("to") || "";
    if (toParam) {
      conditions.push({
        expectedPaymentDate: {
          lte: new Date(toParam + "T23:59:59.999Z"),
        },
      });
    }

    // Batch filter — scope to a specific import batch
    const batchIdParam = searchParams.get("batchId") || "";
    if (batchIdParam && UUID_REGEX.test(batchIdParam)) {
      conditions.push({ importBatchId: batchIdParam });
    }

    // Scope every query to the tenant
    conditions.push({ tenantId: ctx.tenantId });
    const where = { AND: conditions };

    // Three parallel queries: count, data (with receipt join), summary totals
    const [total, transactions, summary] = await Promise.all([
      prisma.cardTransaction.count({ where }),
      prisma.cardTransaction.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          paymentReceipts: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              receivedAt: true,
              receivedAmount: true,
              divergence: true,
              notes: true,
            },
          },
        },
      }),
      prisma.cardTransaction.aggregate({
        where,
        _sum: { grossAmount: true, netAmount: true },
      }),
    ]);

    // Map DB records → API response shape
    const data: TransactionsListResponse = {
      transactions: transactions.map((t) => ({
        id: t.id,
        transactionId: t.transactionId,
        transactionDate: t.transactionDate.toISOString().split("T")[0],
        expectedPaymentDate: t.expectedPaymentDate
          .toISOString()
          .split("T")[0],
        brand: t.brand,
        acquirer: t.acquirer,
        modality: t.modality,
        grossAmount: t.grossAmount.toString(),
        netAmount: t.netAmount.toString(),
        feeAmount: t.feeAmount.toString(),
        feePct: t.feePct.toString(),
        nsu: t.nsu,
        unitCode: t.unitCode,
        unitName: t.unitName,
        installment: t.installment,
        totalInstallments: t.totalInstallments,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        receipt: t.paymentReceipts[0]
          ? {
              id: t.paymentReceipts[0].id,
              receivedAt: t.paymentReceipts[0].receivedAt
                .toISOString()
                .split("T")[0],
              receivedAmount:
                t.paymentReceipts[0].receivedAmount.toString(),
              divergence: t.paymentReceipts[0].divergence.toString(),
              notes: t.paymentReceipts[0].notes,
            }
          : null,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      grossTotal: (summary._sum.grossAmount ?? 0).toString(),
      netTotal: (summary._sum.netAmount ?? 0).toString(),
    };

    return NextResponse.json(data);
  } catch (err) {
    console.error("[GET /api/ar/transactions] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
