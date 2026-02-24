import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const todayMs = now.getTime();

  // Check OBRA PRIMA R$7484.58
  const obraPrima = await prisma.payable.findMany({
    where: {
      supplier: { name: { contains: "OBRA PRIMA", mode: "insensitive" } },
      payValue: 7484.58,
    },
    select: { id: true, status: true, dueDate: true, payValue: true },
  });

  console.log("=== OBRA PRIMA R$7484.58 ===");
  for (const p of obraPrima) {
    const isOverdue = ["PENDING", "APPROVED"].includes(p.status) && p.dueDate.getTime() < todayMs;
    const days = isOverdue ? Math.floor((todayMs - p.dueDate.getTime()) / 86_400_000) : null;
    console.log(`  Due: ${p.dueDate.toISOString().split("T")[0]} | ${p.status} | daysOverdue: ${days ?? "—"}`);
  }

  // Count all overdue PENDING/APPROVED payables
  const allOverdue = await prisma.payable.findMany({
    where: {
      status: { in: ["PENDING", "APPROVED"] },
      dueDate: { lt: now },
    },
    select: { id: true, dueDate: true, payValue: true },
  });

  let totalValue = 0;
  for (const p of allOverdue) {
    totalValue += Number(p.payValue);
  }

  console.log(`\n=== OVERDUE TOTALS ===`);
  console.log(`  Count: ${allOverdue.length} payables`);
  console.log(`  Value: R$${totalValue.toFixed(2)}`);

  await (prisma as any).$disconnect();
  await pool.end();
}

main().catch(console.error);
