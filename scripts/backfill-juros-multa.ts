import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// =============================================================================
// Backfill Juros/Multa — One-time migration script
// =============================================================================
// Computes jurosMulta = max(0, payValue - amount) for all existing payables
// that have jurosMulta = null or 0 (safe to re-run).
//
// Usage: npm run db:backfill-juros
// =============================================================================

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== Backfill Juros/Multa ===\n");

  const payables = await prisma.payable.findMany({
    select: { id: true, amount: true, payValue: true },
  });

  console.log(`Found ${payables.length} payable(s) to process.\n`);

  let updated = 0;
  let skipped = 0;

  for (const p of payables) {
    const amount = Number(p.amount);
    const payValue = Number(p.payValue);
    const jurosMulta = payValue > amount ? payValue - amount : 0;

    // Round to 2 decimal places to avoid floating point issues
    const rounded = Math.round(jurosMulta * 100) / 100;

    await prisma.payable.update({
      where: { id: p.id },
      data: { jurosMulta: rounded },
    });

    if (rounded > 0) {
      updated++;
      console.log(`  ${p.id}: jurosMulta = ${rounded.toFixed(2)}`);
    } else {
      skipped++;
    }
  }

  console.log(`\nDone! ${updated} updated with juros/multa, ${skipped} set to 0.`);
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
