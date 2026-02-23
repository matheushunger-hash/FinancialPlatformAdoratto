// =============================================================================
// AR Import Service — Persistence, Dedup, Audit
// =============================================================================
// Pure service function: ParseResult in → PersistResult out.
// No HTTP concerns — the API route calls this and handles responses.
//
// Three phases:
//   1. Batch overlap detection (same tenant, overlapping date range)
//   2. Transaction dedup (filter out already-imported transactionIds)
//   3. Atomic insert (ImportBatch + CardTransactions + AuditLog)
// =============================================================================

import { prisma } from "@/lib/prisma";
import { DuplicateBatchError } from "./errors";
import type { ParseResult, ParseError } from "./types";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface PersistResult {
  batchId: string;
  acceptedRows: number;
  rejectedRows: number;
  rejected: ParseError[];
}

// ---------------------------------------------------------------------------
// persistBatch — main entry point
// ---------------------------------------------------------------------------

export async function persistBatch(
  parsed: ParseResult,
  userId: string,
  tenantId: string,
  filename: string,
): Promise<PersistResult> {
  const hasDateRange = parsed.meta.dateFrom !== "" && parsed.meta.dateTo !== "";

  // -------------------------------------------------------------------------
  // Phase 1: Batch overlap detection
  // -------------------------------------------------------------------------
  // If any existing ImportBatch in this tenant has a date range that overlaps
  // with the parsed file, throw DuplicateBatchError. The standard overlap
  // formula: A.start <= B.end AND A.end >= B.start.
  // Skip if no accepted rows (dateFrom/dateTo would be empty strings).
  // -------------------------------------------------------------------------

  if (hasDateRange) {
    const overlap = await prisma.importBatch.findFirst({
      where: {
        tenantId,
        dateFrom: { lte: new Date(parsed.meta.dateTo + "T12:00:00") },
        dateTo: { gte: new Date(parsed.meta.dateFrom + "T12:00:00") },
      },
      select: { id: true },
    });

    if (overlap) {
      throw new DuplicateBatchError(overlap.id);
    }
  }

  // -------------------------------------------------------------------------
  // Phase 2: Transaction dedup
  // -------------------------------------------------------------------------
  // Query existing transactionIds for this tenant, filter out duplicates,
  // and add them to the rejected list with a clear reason.
  // -------------------------------------------------------------------------

  let toInsert = parsed.accepted;
  const duplicates: ParseError[] = [];

  if (parsed.accepted.length > 0) {
    const ids = parsed.accepted.map((t) => t.transactionId);

    const existing = await prisma.cardTransaction.findMany({
      where: { tenantId, transactionId: { in: ids } },
      select: { transactionId: true },
    });

    const existingSet = new Set(existing.map((e) => e.transactionId));

    toInsert = parsed.accepted.filter((t) => !existingSet.has(t.transactionId));

    for (const t of parsed.accepted) {
      if (existingSet.has(t.transactionId)) {
        duplicates.push({
          row: t.rowNumber,
          reason: `transactionId duplicado: ${t.transactionId}`,
        });
      }
    }
  }

  const allRejected = [...parsed.rejected, ...duplicates];

  // -------------------------------------------------------------------------
  // Phase 3: Atomic transaction
  // -------------------------------------------------------------------------
  // All writes happen inside prisma.$transaction() — if any part fails,
  // nothing is persisted. Creates ImportBatch, bulk-inserts CardTransactions
  // (via createMany), and logs the operation in AuditLog.
  // -------------------------------------------------------------------------

  // Fallback date for batches with no accepted rows (dateFrom/dateTo empty)
  const batchDateFrom = hasDateRange
    ? new Date(parsed.meta.dateFrom + "T12:00:00")
    : new Date();
  const batchDateTo = hasDateRange
    ? new Date(parsed.meta.dateTo + "T12:00:00")
    : new Date();

  return await prisma.$transaction(async (tx) => {
    // a. Create ImportBatch
    const batch = await tx.importBatch.create({
      data: {
        userId,
        tenantId,
        filename,
        totalRows: parsed.meta.totalRows,
        acceptedRows: toInsert.length,
        rejectedRows: allRejected.length,
        grossTotal: parsed.meta.grossTotal,
        netTotal: parsed.meta.netTotal,
        dateFrom: batchDateFrom,
        dateTo: batchDateTo,
      },
    });

    // b. Bulk insert CardTransactions (skip if nothing to insert)
    if (toInsert.length > 0) {
      await tx.cardTransaction.createMany({
        data: toInsert.map((t) => ({
          tenantId,
          importBatchId: batch.id,
          transactionId: t.transactionId,
          transactionDate: new Date(t.transactionDate + "T12:00:00"),
          expectedPaymentDate: new Date(t.expectedPaymentDate + "T12:00:00"),
          brand: t.brand,
          acquirer: t.acquirer,
          modality: t.modality,
          grossAmount: t.grossAmount,
          netAmount: t.netAmount,
          feeAmount: t.feeAmount,
          feePct: t.feePct,
          nsu: t.nsu,
          unitCode: t.unitCode,
          unitName: t.unitName,
          installment: t.installment,
          totalInstallments: t.totalInstallments,
        })),
      });
    }

    // c. Create AuditLog entry
    await tx.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "IMPORT_BATCH",
        entityType: "ImportBatch",
        entityId: batch.id,
        after: {
          filename,
          acceptedRows: toInsert.length,
          rejectedRows: allRejected.length,
          grossTotal: parsed.meta.grossTotal,
          netTotal: parsed.meta.netTotal,
        },
      },
    });

    // d. Return summary
    return {
      batchId: batch.id,
      acceptedRows: toInsert.length,
      rejectedRows: allRejected.length,
      rejected: allRejected,
    };
  });
}
