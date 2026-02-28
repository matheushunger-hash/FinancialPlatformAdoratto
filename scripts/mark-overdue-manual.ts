/**
 * mark-overdue-manual.ts
 * ---------------------------------------------------------------------------
 * CLI script to manually run the AR overdue detection job.
 * Marks PENDING card transactions with past expectedPaymentDate as OVERDUE.
 *
 * Usage:
 *   npm run db:mark-overdue                          # dry-run (preview only)
 *   npm run db:mark-overdue -- --execute             # apply changes
 *   npm run db:mark-overdue -- --execute --tenant=ID # scope to one tenant
 * ---------------------------------------------------------------------------
 */

import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { markOverdueTransactions } from "../src/lib/ar/jobs/markOverdue";

// ---------------------------------------------------------------------------
// DB setup (same pattern as all scripts — uses DIRECT_URL, not DATABASE_URL)
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const EXECUTE = process.argv.includes("--execute");
const tenantArg = process.argv.find((a) => a.startsWith("--tenant="));
const tenantId = tenantArg?.split("=")[1];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dryRun = !EXECUTE;

  console.log("=== AR Overdue Detection Job ===");
  console.log(`Mode: ${dryRun ? "DRY RUN (preview)" : "EXECUTE (will update)"}`);
  if (tenantId) console.log(`Tenant: ${tenantId}`);
  console.log("");

  const result = await markOverdueTransactions(prisma, { tenantId, dryRun });

  if (result.updated === 0) {
    console.log("No PENDING transactions found with past expectedPaymentDate.");
  } else {
    console.log(`${dryRun ? "Would mark" : "Marked"} ${result.updated} transaction(s) as OVERDUE:`);
    for (const [tid, count] of Object.entries(result.byTenant)) {
      console.log(`  Tenant ${tid}: ${count} transaction(s)`);
    }
  }

  if (dryRun && result.updated > 0) {
    console.log("\nRun with --execute to apply changes.");
  }
}

main()
  .catch((err) => {
    console.error("Job failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
