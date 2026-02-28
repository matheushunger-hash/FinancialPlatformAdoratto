import type { PrismaClient } from "@prisma/client";

export interface OverdueJobResult {
  updated: number;
  byTenant: Record<string, number>;
  dryRun: boolean;
}

/**
 * Marks PENDING card transactions as OVERDUE when their expectedPaymentDate
 * has passed. Idempotent — running twice on the same day produces the same result.
 *
 * @param db - Prisma client instance (injected so both API and scripts can call this)
 * @param options.tenantId - Scope to a single tenant (omit to process all)
 * @param options.dryRun - If true, returns candidates without updating
 */
export async function markOverdueTransactions(
  db: PrismaClient,
  options?: { tenantId?: string; dryRun?: boolean }
): Promise<OverdueJobResult> {
  const { tenantId, dryRun = false } = options ?? {};

  // Build "today at midnight UTC" — the boundary for overdue detection.
  // Transactions with expectedPaymentDate < todayStart are overdue (D+1 rule).
  const now = new Date();
  const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  const todayStart = new Date(`${todayStr}T00:00:00.000Z`);

  // Find all PENDING transactions with expectedPaymentDate in the past
  const where = {
    status: "PENDING" as const,
    expectedPaymentDate: { lt: todayStart },
    ...(tenantId ? { tenantId } : {}),
  };

  const candidates = await db.cardTransaction.findMany({
    where,
    select: { id: true, tenantId: true },
  });

  if (candidates.length === 0) {
    return { updated: 0, byTenant: {}, dryRun };
  }

  // Group by tenant for per-tenant audit entries
  const byTenant: Record<string, string[]> = {};
  for (const c of candidates) {
    if (!byTenant[c.tenantId]) byTenant[c.tenantId] = [];
    byTenant[c.tenantId].push(c.id);
  }

  if (dryRun) {
    const counts: Record<string, number> = {};
    for (const [tid, ids] of Object.entries(byTenant)) {
      counts[tid] = ids.length;
    }
    return { updated: candidates.length, byTenant: counts, dryRun };
  }

  // Bulk update all matched transactions to OVERDUE
  const ids = candidates.map((c) => c.id);
  await db.cardTransaction.updateMany({
    where: { id: { in: ids } },
    data: { status: "OVERDUE" },
  });

  // Create one AuditLog entry per tenant
  for (const [tid, txIds] of Object.entries(byTenant)) {
    await db.auditLog.create({
      data: {
        tenantId: tid,
        userId: null, // system job — no user
        action: "AUTO_MARK_OVERDUE",
        entityType: "CardTransaction",
        entityId: "batch",
        after: { count: txIds.length, transactionIds: txIds },
      },
    });
  }

  const counts: Record<string, number> = {};
  for (const [tid, txIds] of Object.entries(byTenant)) {
    counts[tid] = txIds.length;
  }

  return { updated: candidates.length, byTenant: counts, dryRun };
}
