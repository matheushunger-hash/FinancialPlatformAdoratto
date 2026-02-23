/**
 * scripts/create-tax-suppliers.ts
 *
 * Creates generic supplier records for common tax/government entities.
 * These are used by the import wizard to map tax payments (FGTS, INSS, etc.)
 * to real suppliers with valid CNPJs instead of creating PENDENTE placeholders.
 *
 * Usage: npm run db:create-tax-suppliers
 * Idempotent: uses upsert-like find-then-create pattern.
 */

import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const TAX_SUPPLIERS = [
  { name: "FGTS", document: "00360305000104", documentType: "CNPJ" as const },
  { name: "INSS", document: "29979036000140", documentType: "CNPJ" as const },
  { name: "DAS - SIMPLES NACIONAL", document: "00394460000141", documentType: "CNPJ" as const },
  { name: "ICMS ST", document: "76416940000128", documentType: "CNPJ" as const },
  { name: "SEFAZ", document: "76416940000128", documentType: "CNPJ" as const },
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DIRECT_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Find the first tenant (Adoratto)
    const tenant = await prisma.tenant.findFirst({
      where: { name: { contains: "Adoratto", mode: "insensitive" } },
      select: { id: true, name: true },
    });

    if (!tenant) {
      console.error("No tenant found matching 'Adoratto'");
      process.exit(1);
    }

    console.log(`Tenant: ${tenant.name} (${tenant.id})\n`);

    // Find an admin user to assign as creator
    const admin = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: "ADMIN" },
      select: { id: true, name: true },
    });

    if (!admin) {
      console.error("No ADMIN user found");
      process.exit(1);
    }

    console.log(`Creator: ${admin.name}\n`);

    let created = 0;
    let existing = 0;

    for (const tax of TAX_SUPPLIERS) {
      // Check if supplier already exists by document + tenant
      const found = await prisma.supplier.findFirst({
        where: { tenantId: tenant.id, document: tax.document },
        select: { id: true, name: true },
      });

      if (found) {
        console.log(`  EXISTS: ${tax.name} (${tax.document}) → ${found.name}`);
        existing++;
        continue;
      }

      // For SEFAZ — ICMS ST might already exist with the same CNPJ
      // Use name-based check as fallback
      const byName = await prisma.supplier.findFirst({
        where: {
          tenantId: tenant.id,
          name: { equals: tax.name, mode: "insensitive" },
        },
        select: { id: true },
      });

      if (byName) {
        console.log(`  EXISTS (by name): ${tax.name}`);
        existing++;
        continue;
      }

      await prisma.supplier.create({
        data: {
          userId: admin.id,
          tenantId: tenant.id,
          name: tax.name,
          document: tax.document,
          documentType: tax.documentType,
          active: true,
        },
      });

      console.log(`  CREATED: ${tax.name} (${tax.document})`);
      created++;
    }

    console.log(`\nDone: ${created} created, ${existing} already existed`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
