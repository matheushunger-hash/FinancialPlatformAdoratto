import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Show first 10 supplier documents to see format
  const suppliers = await prisma.supplier.findMany({
    take: 10,
    select: { name: true, document: true },
  });
  console.log("Sample supplier documents in DB:");
  for (const s of suppliers) {
    console.log(`  "${s.document}" — ${s.name}`);
  }

  // Check OBRA PRIMA specifically
  const obraPrima = await prisma.supplier.findMany({
    where: { name: { contains: "OBRA PRIMA", mode: "insensitive" } },
    select: { id: true, name: true, document: true },
  });
  console.log("\nOBRA PRIMA supplier:");
  for (const s of obraPrima) {
    console.log(`  id: ${s.id}, doc: "${s.document}", name: ${s.name}`);
  }

  await (prisma as any).$disconnect();
  await pool.end();
}

main().catch(console.error);
