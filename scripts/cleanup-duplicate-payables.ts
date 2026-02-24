import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// =============================================================================
// Cleanup Duplicate Payables — One-time script
// =============================================================================
// The Feb 23→24 re-import created duplicates in two ways:
//
// Phase 1: Payables WITH invoiceNumber — the old matching key (supplier +
//   amount + dueDate) missed rescheduled payments with different dates/amounts.
//   → Group by tenantId + supplierId + invoiceNumber, keep NEWEST (has updated data).
//
// Phase 2: Payables WITHOUT invoiceNumber (null) — repeated imports created
//   exact copies with identical supplier + amount + dueDate.
//   → Group by tenantId + supplierId + amount + dueDate, keep OLDEST (original).
//
// Usage:
//   npm run db:cleanup-dupes           # dry-run (shows what would be deleted)
//   npm run db:cleanup-dupes -- --apply # actually delete duplicates
// =============================================================================

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type PayableRow = {
  id: string;
  tenantId: string;
  supplierId: string | null;
  invoiceNumber: string | null;
  amount: unknown; // Prisma Decimal
  payValue: unknown; // Prisma Decimal
  dueDate: Date;
  status: string;
  createdAt: Date;
  supplier: { name: string } | null;
};

function formatRow(p: PayableRow): string {
  const created = p.createdAt.toISOString().split("T")[0];
  const due = p.dueDate.toISOString().split("T")[0];
  return `${p.id}  created ${created}  ${p.status}  R$ ${Number(p.payValue).toFixed(2)}  due ${due}`;
}

function groupBy(payables: PayableRow[], keyFn: (p: PayableRow) => string): Map<string, PayableRow[]> {
  const groups = new Map<string, PayableRow[]>();
  for (const p of payables) {
    const key = keyFn(p);
    const group = groups.get(key);
    if (group) {
      group.push(p);
    } else {
      groups.set(key, [p]);
    }
  }
  return groups;
}

async function main() {
  const applyMode = process.argv.includes("--apply");

  console.log("=== Cleanup Duplicate Payables ===");
  console.log(`Mode: ${applyMode ? "APPLY (will delete)" : "DRY RUN (preview only)"}\n`);

  const idsToDelete: string[] = [];
  let dupeGroupCount = 0;

  // ── Phase 1: Payables WITH invoiceNumber ──────────────────────────────────
  // Key: tenantId + supplierId + invoiceNumber → keep NEWEST (rescheduled data)

  console.log("─── Phase 1: Duplicates by invoiceNumber ───\n");

  const withInvoice = await prisma.payable.findMany({
    where: { invoiceNumber: { not: null } },
    select: {
      id: true, tenantId: true, supplierId: true, invoiceNumber: true,
      amount: true, payValue: true, dueDate: true, status: true, createdAt: true,
      supplier: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" }, // newest first
  });

  console.log(`  ${withInvoice.length} payables with invoiceNumber.`);

  const invoiceGroups = groupBy(
    withInvoice as PayableRow[],
    (p) => `${p.tenantId}|${p.supplierId ?? "null"}|${p.invoiceNumber}`,
  );

  for (const [, group] of invoiceGroups) {
    if (group.length < 2) continue;
    dupeGroupCount++;

    const [keep, ...remove] = group; // newest first
    console.log(`\n── invoice "${keep.invoiceNumber}" | ${keep.supplier?.name ?? "Unknown"} (${group.length} records)`);
    console.log(`   KEEP   ${formatRow(keep)}`);
    for (const r of remove) {
      console.log(`   DELETE ${formatRow(r)}`);
      idsToDelete.push(r.id);
    }
  }

  const phase1Count = idsToDelete.length;
  console.log(`\n  Phase 1: ${dupeGroupCount} groups, ${phase1Count} to delete.\n`);

  // ── Phase 2: Payables WITHOUT invoiceNumber ───────────────────────────────
  // Key: tenantId + supplierId + amount + dueDate → keep OLDEST (original)

  console.log("─── Phase 2: Duplicates by supplier + amount + dueDate (no invoice) ───\n");

  const withoutInvoice = await prisma.payable.findMany({
    where: { invoiceNumber: null },
    select: {
      id: true, tenantId: true, supplierId: true, invoiceNumber: true,
      amount: true, payValue: true, dueDate: true, status: true, createdAt: true,
      supplier: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" }, // oldest first
  });

  console.log(`  ${withoutInvoice.length} payables without invoiceNumber.`);

  const nullGroups = groupBy(
    withoutInvoice as PayableRow[],
    (p) => `${p.tenantId}|${p.supplierId ?? "null"}|${Number(p.amount).toFixed(2)}|${p.dueDate.toISOString().split("T")[0]}`,
  );

  let phase2Groups = 0;

  for (const [, group] of nullGroups) {
    if (group.length < 2) continue;
    phase2Groups++;
    dupeGroupCount++;

    const [keep, ...remove] = group; // oldest first
    console.log(`\n── ${keep.supplier?.name ?? "Unknown"} | R$ ${Number(keep.amount).toFixed(2)} | due ${keep.dueDate.toISOString().split("T")[0]} (${group.length} records)`);
    console.log(`   KEEP   ${formatRow(keep)}`);
    for (const r of remove) {
      console.log(`   DELETE ${formatRow(r)}`);
      idsToDelete.push(r.id);
    }
  }

  const phase2Count = idsToDelete.length - phase1Count;
  console.log(`\n  Phase 2: ${phase2Groups} groups, ${phase2Count} to delete.\n`);

  // ── Summary & Execute ─────────────────────────────────────────────────────

  console.log("─".repeat(60));
  console.log(`Total duplicate groups: ${dupeGroupCount}`);
  console.log(`Total records to delete: ${idsToDelete.length} (${phase1Count} phase 1 + ${phase2Count} phase 2)`);

  if (idsToDelete.length === 0) {
    console.log("\nNo duplicates found. Nothing to do.");
    return;
  }

  if (!applyMode) {
    console.log("\n--- DRY RUN --- No records deleted.");
    console.log("Run with --apply to actually delete.\n");
    return;
  }

  console.log("\nDeleting...");

  const result = await prisma.payable.deleteMany({
    where: { id: { in: idsToDelete } },
  });

  console.log(`Deleted ${result.count} duplicate payable(s).`);
  console.log("\nDone!");
}

main()
  .catch((err) => {
    console.error("Cleanup failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
