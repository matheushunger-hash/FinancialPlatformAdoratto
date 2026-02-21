import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// =============================================================================
// Backfill Tenant — One-time migration script
// =============================================================================
// Creates the "Adoratto" tenant and sets tenantId on all existing User,
// Supplier, and Payable rows. This bridges the gap between Phase 1 (nullable
// tenantId) and Phase 2 (required tenantId).
//
// Usage: npm run db:backfill-tenant
// =============================================================================

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== Backfill Tenant ===\n");

  // Step 1: Create or find the "Adoratto" tenant (idempotent)
  let tenant = await prisma.tenant.findFirst({ where: { name: "Adoratto" } });

  if (tenant) {
    console.log(`Tenant already exists: ${tenant.id}`);
  } else {
    tenant = await prisma.tenant.create({ data: { name: "Adoratto" } });
    console.log(`Tenant created: ${tenant.id}`);
  }

  // Step 2: Set tenantId on all rows that don't have one yet
  // updateMany is efficient — one SQL statement per table instead of N individual updates.
  // Note: tenantId is now required in the schema (Phase 2), but this script was
  // designed to run between Phase 1 and Phase 2 when the column was nullable.
  // The `as any` casts are intentional — the DB column may still have NULLs.
  // Safe to re-run — 0 rows match after backfill.
  const usersResult = await prisma.user.updateMany({
    where: { tenantId: null as any },
    data: { tenantId: tenant.id },
  });
  console.log(`Users updated: ${usersResult.count}`);

  const suppliersResult = await prisma.supplier.updateMany({
    where: { tenantId: null as any },
    data: { tenantId: tenant.id },
  });
  console.log(`Suppliers updated: ${suppliersResult.count}`);

  const payablesResult = await prisma.payable.updateMany({
    where: { tenantId: null as any },
    data: { tenantId: tenant.id },
  });
  console.log(`Payables updated: ${payablesResult.count}`);

  console.log("\nBackfill completed successfully!");
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
