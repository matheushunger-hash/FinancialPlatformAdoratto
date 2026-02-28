import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { parseCurrency } from "@/lib/payables/validation";
import { receiptFormSchema } from "@/lib/ar/validation";

// =============================================================================
// POST /api/ar/receipts — Register a receipt for a card transaction (#71)
// =============================================================================
// Validates the transaction exists and is PENDING/OVERDUE, computes divergence,
// atomically creates the PaymentReceipt + updates CardTransaction status +
// creates an AuditLog entry.
// =============================================================================

const ALLOWED_STATUSES = ["PENDING", "OVERDUE"];

// Extend the form schema with transactionId for the API
const requestSchema = receiptFormSchema.extend({
  transactionId: z.string().uuid({ message: "ID de transação inválido" }),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { transactionId, receivedAt, receivedAmount: receivedAmountStr, notes } = parsed.data;

    // Verify transaction exists and belongs to tenant
    const transaction = await prisma.cardTransaction.findFirst({
      where: { id: transactionId, tenantId: ctx.tenantId },
      select: { id: true, status: true, netAmount: true },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: "Transação não encontrada" },
        { status: 404 },
      );
    }

    // Guard: only PENDING or OVERDUE can receive a receipt
    if (!ALLOWED_STATUSES.includes(transaction.status)) {
      return NextResponse.json(
        { error: `Transação com status "${transaction.status}" não pode receber baixa` },
        { status: 409 },
      );
    }

    // Parse currency and compute divergence
    const receivedAmount = parseCurrency(receivedAmountStr);
    if (isNaN(receivedAmount) || receivedAmount <= 0) {
      return NextResponse.json(
        { error: "Valor recebido inválido" },
        { status: 400 },
      );
    }

    const netAmount = Number(transaction.netAmount);
    const divergence = Math.round((netAmount - receivedAmount) * 100) / 100;
    const newStatus = divergence === 0 ? "CONFIRMED" : "DIVERGENT";
    const action = newStatus === "CONFIRMED" ? "CONFIRM_RECEIPT" : "MARK_DIVERGENT";

    // Atomic: create receipt + update status + audit log
    const receipt = await prisma.$transaction(async (tx) => {
      const created = await tx.paymentReceipt.create({
        data: {
          tenantId: ctx.tenantId,
          cardTransactionId: transactionId,
          registeredById: ctx.userId,
          receivedAt: new Date(receivedAt + "T12:00:00"),
          receivedAmount,
          divergence,
          notes: notes || null,
        },
        select: { id: true },
      });

      await tx.cardTransaction.update({
        where: { id: transactionId },
        data: { status: newStatus },
      });

      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action,
          entityType: "CardTransaction",
          entityId: transactionId,
          after: {
            receiptId: created.id,
            receivedAmount,
            divergence,
            newStatus,
          },
        },
      });

      return created;
    });

    return NextResponse.json(
      {
        receipt: {
          id: receipt.id,
          divergence,
          newStatus,
        },
        transactionId,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/ar/receipts] error:", err);
    const message = err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
