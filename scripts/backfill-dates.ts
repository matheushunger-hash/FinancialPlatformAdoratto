import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// =============================================================================
// Backfill Dates — Fix Excel epoch off-by-one (#54)
// =============================================================================
// The Excel serial number parser used Dec 30, 1899 as epoch instead of Dec 31.
// This caused every imported date to be 1 day earlier than correct.
// This script shifts issueDate and dueDate forward by 1 day for all payables.
//
// Safe to run once. NOT idempotent — running twice would shift dates 2 days.
//
// Usage: npm run db:backfill-dates
// =============================================================================

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const ONE_DAY_MS = 86400000;

async function main() {
  console.log("=== Backfill Dates — Fix Excel Epoch Off-by-One ===\n");

  const payables = await prisma.payable.findMany({
    select: { id: true, issueDate: true, dueDate: true },
  });

  console.log(`Found ${payables.length} payable(s) to process.\n`);

  let updated = 0;

  for (const p of payables) {
    const oldIssue = new Date(p.issueDate);
    const oldDue = new Date(p.dueDate);

    // Shift forward by 1 day
    const newIssue = new Date(oldIssue.getTime() + ONE_DAY_MS);
    const newDue = new Date(oldDue.getTime() + ONE_DAY_MS);

    await prisma.payable.update({
      where: { id: p.id },
      data: {
        issueDate: newIssue,
        dueDate: newDue,
      },
    });

    updated++;

    // Log a sample every 100 rows
    if (updated % 100 === 0) {
      console.log(`  ...processed ${updated} of ${payables.length}`);
    }
  }

  console.log(`\nDone! ${updated} payable(s) updated — dates shifted forward by 1 day.`);
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
