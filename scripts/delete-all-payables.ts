import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const applyMode = process.argv.includes("--apply");

  const payableCount = await prisma.payable.count();
  const attachmentCount = await prisma.attachment.count();

  console.log("=== Delete All Payables ===");
  console.log(`Mode: ${applyMode ? "APPLY (will delete)" : "DRY RUN (preview only)"}\n`);
  console.log(`Payables to delete: ${payableCount}`);
  console.log(`Attachments (cascade): ${attachmentCount}`);

  if (payableCount === 0) {
    console.log("\nNo payables found. Nothing to do.");
    return;
  }

  if (!applyMode) {
    console.log("\n--- DRY RUN --- No records deleted.");
    console.log("Run with --apply to actually delete.\n");
    return;
  }

  console.log("\nDeleting all payables (attachments cascade)...");
  const result = await prisma.payable.deleteMany({});
  console.log(`Deleted ${result.count} payable(s).`);
  console.log("Done!");
}

main()
  .catch((err) => {
    console.error("Delete failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
