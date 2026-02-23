import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Script to delete all payables with dueDate in March 2026.
// Run with: npx tsx scripts/delete-march-payables.ts
//
// Two modes:
//   --dry-run (default): count and list what would be deleted
//   --confirm:           actually delete the records

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const MARCH_START = new Date("2026-03-01T00:00:00.000Z");
const APRIL_START = new Date("2026-04-01T00:00:00.000Z");

async function main() {
  const isDryRun = !process.argv.includes("--confirm");

  // Find all payables with dueDate in March 2026
  const payables = await prisma.payable.findMany({
    where: {
      dueDate: {
        gte: MARCH_START,
        lt: APRIL_START,
      },
    },
    include: {
      supplier: { select: { name: true, document: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  console.log(`\nFound ${payables.length} payables with dueDate in March 2026:\n`);

  if (payables.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  // Show summary grouped by supplier
  const bySupplier = new Map<string, { count: number; total: number }>();
  for (const p of payables) {
    const key = p.supplier.name;
    const entry = bySupplier.get(key) || { count: 0, total: 0 };
    entry.count++;
    entry.total += Number(p.amount);
    bySupplier.set(key, entry);
  }

  for (const [name, { count, total }] of bySupplier.entries()) {
    console.log(`  ${name}: ${count} payables, R$ ${total.toFixed(2)}`);
  }
  console.log(`\n  TOTAL: ${payables.length} payables`);

  if (isDryRun) {
    console.log("\n--- DRY RUN --- No records deleted.");
    console.log("Run with --confirm to actually delete.\n");
    return;
  }

  // Actually delete
  console.log("\nDeleting...");

  // First delete any attachments for these payables
  const payableIds = payables.map((p) => p.id);

  const attachmentResult = await prisma.attachment.deleteMany({
    where: { payableId: { in: payableIds } },
  });
  console.log(`  Deleted ${attachmentResult.count} attachments`);

  // Then delete the payables themselves
  const payableResult = await prisma.payable.deleteMany({
    where: { id: { in: payableIds } },
  });
  console.log(`  Deleted ${payableResult.count} payables`);

  console.log("\nDone!");
}

main()
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
