/**
 * seed-ar-transactions.ts
 * ---------------------------------------------------------------------------
 * Generates fake AR (Accounts Receivable) card transactions for testing.
 * Creates one ImportBatch + 50 CardTransactions with realistic data:
 *   - Mix of brands (Visa, Mastercard, Elo, Amex, Hipercard)
 *   - Mix of acquirers (Cielo, Stone, Rede, PagSeguro)
 *   - Mix of modalities (Crédito à Vista, Crédito Parcelado, Débito)
 *   - Due dates spread across past (OVERDUE), today, and next 14 days (PENDING)
 *   - Realistic fee percentages (2.5%–5.5%)
 *
 * Usage:
 *   npx tsx scripts/seed-ar-transactions.ts
 * ---------------------------------------------------------------------------
 */

import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Realistic data pools
// ---------------------------------------------------------------------------

const BRANDS = ["VISA", "MASTERCARD", "ELO", "AMEX", "HIPERCARD"];
const ACQUIRERS = ["CIELO", "STONE", "REDE", "PAGSEGURO"];
const MODALITIES = [
  { name: "Crédito à Vista", installments: 1 },
  { name: "Crédito Parcelado 2x", installments: 2 },
  { name: "Crédito Parcelado 3x", installments: 3 },
  { name: "Crédito Parcelado 6x", installments: 6 },
  { name: "Débito", installments: 1 },
];

// Fee ranges by modality type (realistic Brazilian rates)
const FEE_RANGES: Record<string, [number, number]> = {
  "Débito": [1.5, 2.5],
  "Crédito à Vista": [2.8, 4.0],
  default: [3.5, 5.5], // installment credit
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randomNSU(): string {
  return String(Math.floor(Math.random() * 900000000) + 100000000);
}

function randomTxId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  for (let i = 0; i < 20; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// Generate a date offset from today (negative = past, positive = future)
function dateOffset(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Seed AR Transactions ===\n");

  // Resolve tenant and user (same as other scripts)
  const adminUser = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, tenantId: true },
  });

  if (!adminUser) {
    console.error("ERROR: No ADMIN user found. Run db:seed first.");
    process.exit(1);
  }

  const { id: userId, tenantId } = adminUser;

  // Clean existing AR data for a fresh test
  const deletedReceipts = await prisma.paymentReceipt.deleteMany({ where: { tenantId } });
  const deletedTx = await prisma.cardTransaction.deleteMany({ where: { tenantId } });
  const deletedBatches = await prisma.importBatch.deleteMany({ where: { tenantId } });
  console.log(`Cleaned: ${deletedReceipts.count} receipts, ${deletedTx.count} transactions, ${deletedBatches.count} batches\n`);

  // --- Generate 50 transactions ---
  const TX_COUNT = 50;
  const transactions: {
    transactionId: string;
    transactionDate: Date;
    expectedPaymentDate: Date;
    brand: string;
    acquirer: string;
    modality: string;
    grossAmount: number;
    netAmount: number;
    feeAmount: number;
    feePct: number;
    nsu: string;
    installment: number;
    totalInstallments: number;
    status: "PENDING" | "OVERDUE";
  }[] = [];

  // Distribution: 10 overdue (past), 5 today, 35 upcoming (next 14 days)
  const dayOffsets: number[] = [];
  for (let i = 0; i < 10; i++) dayOffsets.push(-Math.floor(Math.random() * 14) - 1); // -1 to -14
  for (let i = 0; i < 5; i++) dayOffsets.push(0); // today
  for (let i = 0; i < 35; i++) dayOffsets.push(Math.floor(Math.random() * 14) + 1); // +1 to +14

  let grossTotal = 0;
  let netTotal = 0;
  let earliestDate = new Date("2099-01-01");
  let latestDate = new Date("2000-01-01");

  for (let i = 0; i < TX_COUNT; i++) {
    const mod = pick(MODALITIES);
    const grossAmount = rand(50, 5000);
    const feeRange = FEE_RANGES[mod.name] ?? FEE_RANGES.default;
    const feePct = rand(feeRange[0], feeRange[1]);
    const feeAmount = Math.round(grossAmount * feePct) / 100;
    const netAmount = Math.round((grossAmount - feeAmount) * 100) / 100;

    const offset = dayOffsets[i];
    const transactionDate = dateOffset(offset - 30); // sale happened ~30 days before payment
    const expectedPaymentDate = dateOffset(offset);
    const status = offset < 0 ? "OVERDUE" as const : "PENDING" as const;

    if (transactionDate < earliestDate) earliestDate = transactionDate;
    if (transactionDate > latestDate) latestDate = transactionDate;
    grossTotal += grossAmount;
    netTotal += netAmount;

    transactions.push({
      transactionId: randomTxId(),
      transactionDate,
      expectedPaymentDate,
      brand: pick(BRANDS),
      acquirer: pick(ACQUIRERS),
      modality: mod.name,
      grossAmount,
      netAmount,
      feeAmount,
      feePct,
      nsu: randomNSU(),
      installment: 1,
      totalInstallments: mod.installments,
      status,
    });
  }

  // --- Create ImportBatch + transactions in a single transaction ---
  const batch = await prisma.importBatch.create({
    data: {
      userId,
      tenantId,
      filename: "seed-test-data.xlsx",
      totalRows: TX_COUNT,
      acceptedRows: TX_COUNT,
      rejectedRows: 0,
      grossTotal: Math.round(grossTotal * 100) / 100,
      netTotal: Math.round(netTotal * 100) / 100,
      dateFrom: earliestDate,
      dateTo: latestDate,
      cardTransactions: {
        createMany: {
          data: transactions.map((tx) => ({
            tenantId,
            transactionId: tx.transactionId,
            transactionDate: tx.transactionDate,
            expectedPaymentDate: tx.expectedPaymentDate,
            brand: tx.brand,
            acquirer: tx.acquirer,
            modality: tx.modality,
            grossAmount: tx.grossAmount,
            netAmount: tx.netAmount,
            feeAmount: tx.feeAmount,
            feePct: tx.feePct,
            nsu: tx.nsu,
            unitCode: "001",
            unitName: "Adoratto Matriz",
            installment: tx.installment,
            totalInstallments: tx.totalInstallments,
            status: tx.status,
          })),
        },
      },
    },
    select: { id: true },
  });

  // --- Report ---
  const overdue = transactions.filter((t) => t.status === "OVERDUE").length;
  const pending = transactions.filter((t) => t.status === "PENDING").length;

  console.log(`Created ImportBatch: ${batch.id}`);
  console.log(`Created ${TX_COUNT} transactions:`);
  console.log(`  OVERDUE:  ${overdue} (past due dates)`);
  console.log(`  PENDING:  ${pending} (today + upcoming)`);
  console.log(`  Gross: R$ ${grossTotal.toFixed(2)}`);
  console.log(`  Net:   R$ ${netTotal.toFixed(2)}`);
  console.log(`\nBrands: ${[...new Set(transactions.map((t) => t.brand))].join(", ")}`);
  console.log(`Acquirers: ${[...new Set(transactions.map((t) => t.acquirer))].join(", ")}`);
  console.log("\nDone! Navigate to /dashboard/recebimentos to see the data.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
