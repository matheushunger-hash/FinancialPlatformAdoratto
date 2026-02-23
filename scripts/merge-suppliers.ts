import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// =============================================================================
// Merge Suppliers — Reassign payables from a duplicate to the real supplier
// =============================================================================
// When the import wizard creates a PENDENTE-NNN placeholder supplier and the
// real supplier (with actual CNPJ) already exists or is imported later, payables
// end up split between two supplier records. This script merges them.
//
// Usage:
//   npm run db:merge-suppliers -- --from <duplicate-id> --to <real-id>
//   npm run db:merge-suppliers -- --from <duplicate-id> --to <real-id> --apply
//
// Dry run by default — shows what would change. Add --apply to execute.
// =============================================================================

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const args = process.argv.slice(2);
  const fromIndex = args.indexOf("--from");
  const toIndex = args.indexOf("--to");
  const apply = args.includes("--apply");

  if (fromIndex === -1 || toIndex === -1 || !args[fromIndex + 1] || !args[toIndex + 1]) {
    console.error("Usage: npm run db:merge-suppliers -- --from <duplicate-id> --to <real-id> [--apply]");
    process.exit(1);
  }

  const fromId = args[fromIndex + 1];
  const toId = args[toIndex + 1];

  if (fromId === toId) {
    console.error("Error: --from and --to cannot be the same supplier.");
    process.exit(1);
  }

  console.log("=== Merge Suppliers ===\n");

  // Fetch both suppliers
  const [fromSupplier, toSupplier] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: fromId } }),
    prisma.supplier.findUnique({ where: { id: toId } }),
  ]);

  if (!fromSupplier) {
    console.error(`Error: Source supplier not found (--from ${fromId})`);
    process.exit(1);
  }
  if (!toSupplier) {
    console.error(`Error: Target supplier not found (--to ${toId})`);
    process.exit(1);
  }

  // Count linked records
  const [payableCount, recurringCount] = await Promise.all([
    prisma.payable.count({ where: { supplierId: fromId } }),
    prisma.recurringPayable.count({ where: { supplierId: fromId } }),
  ]);

  console.log("Source (duplicate — will be deactivated):");
  console.log(`  Name:     ${fromSupplier.name}`);
  console.log(`  Document: ${fromSupplier.document}`);
  console.log(`  ID:       ${fromSupplier.id}`);
  console.log(`  Payables: ${payableCount}`);
  console.log(`  Recurring: ${recurringCount}`);
  console.log();
  console.log("Target (real — will receive the payables):");
  console.log(`  Name:     ${toSupplier.name}`);
  console.log(`  Document: ${toSupplier.document}`);
  console.log(`  ID:       ${toSupplier.id}`);
  console.log();

  if (payableCount === 0 && recurringCount === 0) {
    console.log("Nothing to merge — source supplier has no linked records.");
    console.log("You can deactivate it manually if needed.");
    return;
  }

  if (!apply) {
    console.log(`DRY RUN — Would reassign ${payableCount} payable(s) and ${recurringCount} recurring template(s).`);
    console.log("Run with --apply to execute.\n");
    return;
  }

  // Execute the merge in a transaction
  console.log("Applying merge...\n");

  await prisma.$transaction(async (tx) => {
    // 1. Reassign payables
    if (payableCount > 0) {
      const result = await tx.payable.updateMany({
        where: { supplierId: fromId },
        data: { supplierId: toId },
      });
      console.log(`  ✓ Reassigned ${result.count} payable(s)`);
    }

    // 2. Reassign recurring payables
    if (recurringCount > 0) {
      const result = await tx.recurringPayable.updateMany({
        where: { supplierId: fromId },
        data: { supplierId: toId },
      });
      console.log(`  ✓ Reassigned ${result.count} recurring template(s)`);
    }

    // 3. Deactivate the duplicate supplier (soft delete)
    await tx.supplier.update({
      where: { id: fromId },
      data: { active: false },
    });
    console.log(`  ✓ Deactivated duplicate supplier (${fromSupplier.document})`);
  });

  console.log("\nMerge complete!");
  console.log(`All records now point to: ${toSupplier.name} (${toSupplier.document})`);
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
