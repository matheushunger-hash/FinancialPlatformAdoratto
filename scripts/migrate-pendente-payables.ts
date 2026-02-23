/**
 * scripts/migrate-pendente-payables.ts
 *
 * Migrates existing payables that have PENDENTE-NNN placeholder suppliers:
 *   1. Salary-pattern names → set payee = supplierName, supplierId = null
 *   2. Tax-pattern names → reassign to generic tax supplier
 *   3. Remaining PENDENTE suppliers with 0 payables → deactivate
 *
 * Dry run by default. Pass --apply to execute changes.
 *
 * Usage:
 *   npm run db:migrate-pendente-payables          # dry run
 *   npm run db:migrate-pendente-payables -- --apply  # apply changes
 */

import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const SALARY_PATTERNS = /^(SALARIO|SALÁRIO|FERIAS|FÉRIAS|RESCIS[ÃA]O|13º?\s*SAL|ADIANTAMENTO)\b/i;

const TAX_KEYWORDS = ["FGTS", "INSS", "DAS", "ICMS ST", "SEFAZ"];

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "MODE: APPLY (changes will be saved)\n" : "MODE: DRY RUN (no changes)\n");

  const pool = new Pool({ connectionString: process.env.DIRECT_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Find the tenant
    const tenant = await prisma.tenant.findFirst({
      where: { name: { contains: "Adoratto", mode: "insensitive" } },
      select: { id: true, name: true },
    });

    if (!tenant) {
      console.error("No tenant found matching 'Adoratto'");
      process.exit(1);
    }

    console.log(`Tenant: ${tenant.name} (${tenant.id})\n`);

    // Find all PENDENTE suppliers
    const pendenteSuppliers = await prisma.supplier.findMany({
      where: {
        tenantId: tenant.id,
        document: { startsWith: "PENDENTE-" },
      },
      select: { id: true, name: true, document: true },
    });

    console.log(`Found ${pendenteSuppliers.length} PENDENTE suppliers\n`);

    // Build a cache of tax supplier IDs
    const taxSupplierMap = new Map<string, string>();
    for (const keyword of TAX_KEYWORDS) {
      const supplier = await prisma.supplier.findFirst({
        where: {
          tenantId: tenant.id,
          name: { startsWith: keyword, mode: "insensitive" },
          active: true,
          document: { not: { startsWith: "PENDENTE-" } },
        },
        select: { id: true, name: true },
      });
      if (supplier) {
        taxSupplierMap.set(keyword, supplier.id);
        console.log(`Tax supplier: ${keyword} → ${supplier.name} (${supplier.id})`);
      }
    }
    console.log("");

    let salaryCount = 0;
    let taxCount = 0;
    let deactivatedCount = 0;
    let skippedCount = 0;

    for (const supplier of pendenteSuppliers) {
      // Find all payables for this supplier
      const payables = await prisma.payable.findMany({
        where: { supplierId: supplier.id },
        select: { id: true },
      });

      if (payables.length === 0) {
        // No payables — deactivate the supplier
        console.log(`  DEACTIVATE: ${supplier.name} (${supplier.document}) — 0 payables`);
        if (apply) {
          await prisma.supplier.update({
            where: { id: supplier.id },
            data: { active: false },
          });
        }
        deactivatedCount++;
        continue;
      }

      // Check if it's a salary pattern
      if (SALARY_PATTERNS.test(supplier.name)) {
        console.log(`  SALARY: ${supplier.name} (${supplier.document}) — ${payables.length} payable(s) → payee`);
        if (apply) {
          await prisma.payable.updateMany({
            where: { supplierId: supplier.id },
            data: {
              supplierId: null,
              payee: supplier.name,
            },
          });
          // Deactivate the PENDENTE supplier
          await prisma.supplier.update({
            where: { id: supplier.id },
            data: { active: false },
          });
        }
        salaryCount += payables.length;
        continue;
      }

      // Check if it's a tax pattern
      const taxKeyword = TAX_KEYWORDS.find((k) =>
        supplier.name.toUpperCase().startsWith(k),
      );
      if (taxKeyword && taxSupplierMap.has(taxKeyword)) {
        const taxSupplierId = taxSupplierMap.get(taxKeyword)!;
        console.log(`  TAX: ${supplier.name} (${supplier.document}) — ${payables.length} payable(s) → ${taxKeyword}`);
        if (apply) {
          await prisma.payable.updateMany({
            where: { supplierId: supplier.id },
            data: { supplierId: taxSupplierId },
          });
          // Deactivate the PENDENTE supplier
          await prisma.supplier.update({
            where: { id: supplier.id },
            data: { active: false },
          });
        }
        taxCount += payables.length;
        continue;
      }

      // Neither salary nor tax — skip (keep as-is)
      console.log(`  SKIP: ${supplier.name} (${supplier.document}) — ${payables.length} payable(s)`);
      skippedCount++;
    }

    console.log("\n--- Summary ---");
    console.log(`Salary payables → payee: ${salaryCount}`);
    console.log(`Tax payables → generic supplier: ${taxCount}`);
    console.log(`Suppliers deactivated (0 payables): ${deactivatedCount}`);
    console.log(`Suppliers skipped (unmatched): ${skippedCount}`);

    if (!apply) {
      console.log("\nThis was a DRY RUN. Pass --apply to execute changes.");
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
