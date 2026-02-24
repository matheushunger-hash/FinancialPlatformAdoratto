import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// =============================================================================
// Cleanup Duplicate Payables — One-time script
// =============================================================================
// The Feb 23→24 re-import created duplicates because the old matching key
// (supplier + amount + dueDate) missed rescheduled payments. Now that import
// dedup uses invoiceNumber as primary key, we need to remove the old dupes.
//
// Detection: group by tenantId + supplierId + invoiceNumber → keep newest
// (createdAt DESC), delete older records.
//
// Usage:
//   npm run db:cleanup-dupes           # dry-run (shows what would be deleted)
//   npm run db:cleanup-dupes -- --apply # actually delete duplicates
// =============================================================================

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const applyMode = process.argv.includes("--apply");

  console.log("=== Cleanup Duplicate Payables ===");
  console.log(`Mode: ${applyMode ? "APPLY (will delete)" : "DRY RUN (preview only)"}\n`);

  // 1. Fetch all payables with a non-null invoiceNumber (+ supplier name for display)
  const payables = await prisma.payable.findMany({
    where: {
      invoiceNumber: { not: null },
    },
    select: {
      id: true,
      tenantId: true,
      supplierId: true,
      invoiceNumber: true,
      description: true,
      amount: true,
      payValue: true,
      dueDate: true,
      status: true,
      createdAt: true,
      supplier: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" }, // newest first within each group
  });

  console.log(`Found ${payables.length} payables with invoiceNumber.\n`);

  // 2. Group by tenantId + supplierId + invoiceNumber
  const groups = new Map<string, typeof payables>();

  for (const p of payables) {
    const key = `${p.tenantId}|${p.supplierId ?? "null"}|${p.invoiceNumber}`;
    const group = groups.get(key);
    if (group) {
      group.push(p);
    } else {
      groups.set(key, [p]);
    }
  }

  // 3. Find groups with 2+ records (duplicates)
  const idsToDelete: string[] = [];
  let dupeGroupCount = 0;

  for (const [, group] of groups) {
    if (group.length < 2) continue;

    dupeGroupCount++;

    // group is already sorted newest-first (createdAt DESC from the query)
    const [keep, ...remove] = group;

    console.log(`── Duplicate group: invoice "${keep.invoiceNumber}" | ${keep.supplier?.name ?? "Unknown supplier"}`);
    console.log(`   ${group.length} records found — keeping newest, deleting ${remove.length}`);
    console.log(`   KEEP   ${keep.id}  created ${keep.createdAt.toISOString().split("T")[0]}  ${keep.status}  R$ ${Number(keep.payValue).toFixed(2)}  due ${keep.dueDate.toISOString().split("T")[0]}`);

    for (const r of remove) {
      console.log(`   DELETE ${r.id}  created ${r.createdAt.toISOString().split("T")[0]}  ${r.status}  R$ ${Number(r.payValue).toFixed(2)}  due ${r.dueDate.toISOString().split("T")[0]}`);
      idsToDelete.push(r.id);
    }

    console.log();
  }

  // 4. Summary
  console.log("─".repeat(60));
  console.log(`Duplicate groups: ${dupeGroupCount}`);
  console.log(`Records to delete: ${idsToDelete.length}`);

  if (idsToDelete.length === 0) {
    console.log("\nNo duplicates found. Nothing to do.");
    return;
  }

  if (!applyMode) {
    console.log("\n--- DRY RUN --- No records deleted.");
    console.log("Run with --apply to actually delete.\n");
    return;
  }

  // 5. Delete the older duplicates
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
