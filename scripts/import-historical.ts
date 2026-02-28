/**
 * import-historical.ts
 * ---------------------------------------------------------------------------
 * CLI script for bulk historical spreadsheet import with dry-run preview.
 * Reads the operational .xlsx file, applies the same business rules as the
 * web import wizard, and writes to the database.
 *
 * Reuses parsing functions from src/lib/import/parsing.ts.
 *
 * Usage:
 *   npm run db:import-historical                              # dry-run
 *   npm run db:import-historical -- --execute                 # apply
 *   npm run db:import-historical -- --file path/to/other.xlsx # custom file
 * ---------------------------------------------------------------------------
 */

import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import {
  parseImportDate,
  processImportDocument,
  normalizeName,
} from "../src/lib/import/parsing";

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
const fileArgIdx = process.argv.indexOf("--file");
const FILE_PATH =
  fileArgIdx !== -1 && process.argv[fileArgIdx + 1]
    ? process.argv[fileArgIdx + 1]
    : "planilhabase/newspreadsheet.xlsx";

// ---------------------------------------------------------------------------
// Known spreadsheet column headers → field mapping
// ---------------------------------------------------------------------------

interface SpreadsheetRow {
  "Pago?"?: string;
  Conta?: string;
  "Data de Entrada"?: number | string;
  Fornecedor?: string;
  CNPJ?: string;
  "Nota Fiscal"?: string | number;
  Obs?: string;
  Data?: number | string;
  Valor?: number | string;
  "Valor a Pagar"?: number | string;
  "Excluídas"?: string;
  "Mês Ref."?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Patterns for salary/tax payees (same as API import route)
// ---------------------------------------------------------------------------

const SALARY_PATTERNS =
  /^(SALARIO|SALÁRIO|FERIAS|FÉRIAS|RESCIS[ÃA]O|13º?\s*SAL|ADIANTAMENTO)\b/i;
const TAX_KEYWORDS = ["FGTS", "INSS", "DAS", "ICMS ST", "SEFAZ"];

// ---------------------------------------------------------------------------
// Currency parsing (same as parseCurrency in validation.ts)
// ---------------------------------------------------------------------------

function parseCurrency(value: string | number): number {
  if (typeof value === "number") return value;
  const cleaned = value
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return parseFloat(cleaned);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(EXECUTE ? "=== Historical Import ===" : "=== Historical Import Preview ===");
  console.log(`File: ${FILE_PATH}`);
  console.log();

  // --- Read spreadsheet ---
  const workbook = XLSX.readFile(FILE_PATH);
  const sheetName = workbook.SheetNames[0];
  const rows: SpreadsheetRow[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

  console.log(`Rows: ${rows.length}\n`);

  if (rows.length === 0) {
    console.log("No rows found. Exiting.");
    return;
  }

  // --- Resolve tenant and user ---
  // Use the first admin user's tenant (same as seed pattern)
  const adminUser = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, tenantId: true },
  });

  if (!adminUser) {
    console.error("ERROR: No ADMIN user found in database. Run db:seed first.");
    process.exit(1);
  }

  const { userId, tenantId } = { userId: adminUser.id, tenantId: adminUser.tenantId };

  // --- Supplier dedup cache ---
  const supplierCache = new Map<string, string>();

  // Find max PENDENTE-NNN counter
  let pendenteCounter = 0;
  const maxPendente = await prisma.supplier.findFirst({
    where: { tenantId, document: { startsWith: "PENDENTE-" } },
    orderBy: { document: "desc" },
    select: { document: true },
  });
  if (maxPendente) {
    const num = parseInt(maxPendente.document.replace("PENDENTE-", ""), 10);
    if (!isNaN(num)) pendenteCounter = num;
  }

  // Tax supplier cache
  const taxSupplierCache = new Map<string, string>();

  async function findTaxSupplier(keyword: string): Promise<string | null> {
    const cached = taxSupplierCache.get(keyword);
    if (cached) return cached;
    const supplier = await prisma.supplier.findFirst({
      where: { tenantId, name: { startsWith: keyword, mode: "insensitive" }, active: true },
      select: { id: true },
    });
    if (supplier) {
      taxSupplierCache.set(keyword, supplier.id);
      return supplier.id;
    }
    return null;
  }

  async function findOrCreateSupplier(
    name: string,
    rawDocument: unknown,
  ): Promise<{ id: string; created: boolean }> {
    const { digits, documentType } = processImportDocument(rawDocument);

    // Strategy 1: Has document → lookup by document + tenantId
    if (digits.length > 0) {
      const cached = supplierCache.get(digits);
      if (cached) return { id: cached, created: false };

      const existing = await prisma.supplier.findFirst({
        where: { document: digits, tenantId },
        select: { id: true },
      });
      if (existing) {
        supplierCache.set(digits, existing.id);
        return { id: existing.id, created: false };
      }

      if (!EXECUTE) {
        // In dry-run, generate a fake ID for counting
        const fakeId = `dry-run-${digits}`;
        supplierCache.set(digits, fakeId);
        return { id: fakeId, created: true };
      }

      const created = await prisma.supplier.create({
        data: { userId, tenantId, name, documentType, document: digits, active: true },
        select: { id: true },
      });
      supplierCache.set(digits, created.id);
      return { id: created.id, created: true };
    }

    // Strategy 2: No document → lookup by name (case-insensitive)
    const nameLower = name.toLowerCase();
    const cacheKey = `name:${nameLower}`;
    const cached = supplierCache.get(cacheKey);
    if (cached) return { id: cached, created: false };

    const existing = await prisma.supplier.findFirst({
      where: { tenantId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      supplierCache.set(cacheKey, existing.id);
      return { id: existing.id, created: false };
    }

    if (!EXECUTE) {
      const fakeId = `dry-run-name-${nameLower}`;
      supplierCache.set(cacheKey, fakeId);
      return { id: fakeId, created: true };
    }

    pendenteCounter++;
    const placeholder = `PENDENTE-${String(pendenteCounter).padStart(3, "0")}`;
    const created = await prisma.supplier.create({
      data: { userId, tenantId, name, documentType: "CNPJ", document: placeholder, active: true },
      select: { id: true },
    });
    supplierCache.set(cacheKey, created.id);
    return { id: created.id, created: true };
  }

  // --- Stats ---
  const stats = {
    temporal: 0,
    held: 0,
    paid: 0,
    created: 0,
    updated: 0,
    suppliersExisting: 0,
    suppliersCreated: 0,
    errors: 0,
  };
  const errors: { row: number; reason: string }[] = [];

  // --- Process rows ---
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2: row 1 is headers, 0-indexed

    try {
      // --- Extract fields ---
      const rawSupplierName = row["Fornecedor"];
      const supplierName = normalizeName(String(rawSupplierName || ""));
      if (!supplierName) {
        errors.push({ row: rowNum, reason: "Nome do fornecedor vazio" });
        stats.errors++;
        continue;
      }

      const rawAmount = row["Valor"];
      const amountStr = String(rawAmount ?? "").trim();
      if (!amountStr) {
        errors.push({ row: rowNum, reason: "Valor vazio" });
        stats.errors++;
        continue;
      }
      const amount = parseCurrency(amountStr);
      if (isNaN(amount) || amount <= 0) {
        errors.push({ row: rowNum, reason: `Valor inválido: "${amountStr}"` });
        stats.errors++;
        continue;
      }

      const rawDueDate = row["Data"];
      const dueDate = parseImportDate(rawDueDate);
      if (!dueDate) {
        errors.push({ row: rowNum, reason: `Data inválida: "${String(rawDueDate || "")}"` });
        stats.errors++;
        continue;
      }

      // Optional fields
      const rawIssueDate = row["Data de Entrada"];
      const issueDate = parseImportDate(rawIssueDate) || dueDate;

      const rawPayValue = row["Valor a Pagar"];
      let payValue = amount;
      if (rawPayValue != null && String(rawPayValue).trim()) {
        const parsed = parseCurrency(String(rawPayValue));
        if (!isNaN(parsed) && parsed > 0) payValue = parsed;
      }

      const rawInvoice = row["Nota Fiscal"];
      const invoiceStr = rawInvoice != null ? String(rawInvoice).trim() : null;

      const rawNotes = row["Obs"];
      const notesStr = rawNotes != null ? String(rawNotes).trim() : null;

      const rawCategory = row["Conta"];
      const category =
        rawCategory && String(rawCategory).toUpperCase().includes("REVENDA")
          ? "REVENDA"
          : "DESPESA";

      const jurosMulta = payValue > amount ? payValue - amount : 0;

      // --- Segurado detection ---
      const rawExcludedTag = String(row["Excluídas"] || "").trim();
      const isSegurado = /segurado/i.test(rawExcludedTag);

      // Embedded date in Excluídas cell (e.g. "-segurado 10/02")
      const embeddedDateMatch = rawExcludedTag.match(/(\d{1,2})\/(\d{1,2})/);
      const embeddedDate = embeddedDateMatch
        ? parseImportDate(`${embeddedDateMatch[1]}/${embeddedDateMatch[2]}`)
        : null;

      // Mês Ref takes priority, embedded date is fallback
      const rawRefDate = row["Mês Ref."];
      const refDate = parseImportDate(rawRefDate) ?? embeddedDate;

      const tags: string[] = [];
      if (isSegurado && !tags.includes("segurado")) {
        tags.push("segurado");
      }

      // --- Paid detection ---
      const rawPaidStatus = row["Pago?"];
      const isPaid = /^sim$/i.test(String(rawPaidStatus || "").trim());
      const paidAt = isPaid ? new Date() : null;
      const markedPaidAt = isPaid ? new Date() : null;

      // Determine actionStatus
      const importActionStatus = isPaid ? "PAID" : isSegurado ? "HELD" : null;

      // Count by status
      if (isPaid) stats.paid++;
      else if (isSegurado) stats.held++;
      else stats.temporal++;

      // --- Resolve supplier vs payee ---
      const rawDocument = row["CNPJ"];
      let resolvedSupplierId: string | null = null;
      let resolvedPayee: string | null = null;

      if (SALARY_PATTERNS.test(supplierName)) {
        resolvedPayee = supplierName;
      } else {
        const taxKeyword = TAX_KEYWORDS.find((k) =>
          supplierName.toUpperCase().startsWith(k),
        );
        if (taxKeyword) {
          const taxSupplierId = await findTaxSupplier(taxKeyword);
          if (taxSupplierId) {
            resolvedSupplierId = taxSupplierId;
            stats.suppliersExisting++;
          } else {
            const supplier = await findOrCreateSupplier(supplierName, rawDocument);
            resolvedSupplierId = supplier.id;
            if (supplier.created) stats.suppliersCreated++;
            else stats.suppliersExisting++;
          }
        } else {
          const supplier = await findOrCreateSupplier(supplierName, rawDocument);
          resolvedSupplierId = supplier.id;
          if (supplier.created) stats.suppliersCreated++;
          else stats.suppliersExisting++;
        }
      }

      // --- Date resolution (segurado swap) ---
      const parsedIssueDate = new Date(issueDate + "T12:00:00");
      const vencimentoDate = new Date(dueDate + "T12:00:00");

      let resolvedRefDate = refDate;
      if (isSegurado && resolvedRefDate) {
        const refObj = new Date(resolvedRefDate + "T12:00:00");
        if (refObj > new Date()) {
          refObj.setFullYear(refObj.getFullYear() - 1);
          const yy = refObj.getFullYear();
          const mm = String(refObj.getMonth() + 1).padStart(2, "0");
          const dd = String(refObj.getDate()).padStart(2, "0");
          resolvedRefDate = `${yy}-${mm}-${dd}`;
        }
      }

      const parsedDueDate =
        isSegurado && resolvedRefDate
          ? new Date(resolvedRefDate + "T12:00:00")
          : vencimentoDate;
      const parsedOverdueTrackedAt =
        isSegurado && resolvedRefDate ? vencimentoDate : null;
      const parsedScheduledDate =
        isSegurado && resolvedRefDate ? vencimentoDate : parsedDueDate;

      // --- In dry-run mode, just count ---
      if (!EXECUTE) {
        // Simulate update-vs-create check
        if (resolvedSupplierId && !resolvedSupplierId.startsWith("dry-run")) {
          let existing = false;
          if (invoiceStr) {
            const match = await prisma.payable.findFirst({
              where: { tenantId, supplierId: resolvedSupplierId, invoiceNumber: invoiceStr },
              select: { id: true },
            });
            if (match) existing = true;
          }
          if (!existing) {
            const match = await prisma.payable.findFirst({
              where: { tenantId, supplierId: resolvedSupplierId, amount, dueDate: parsedDueDate },
              select: { id: true },
            });
            if (match) existing = true;
          }
          if (existing) stats.updated++;
          else stats.created++;
        } else {
          stats.created++;
        }
        continue;
      }

      // --- Execute mode: update-vs-create ---
      if (resolvedSupplierId) {
        let existingPayable: { id: string; dueDate: Date; actionStatus: string | null } | null = null;
        let matchedByInvoice = false;

        // Tier 1: Match by invoice number
        if (invoiceStr) {
          existingPayable = await prisma.payable.findFirst({
            where: { tenantId, supplierId: resolvedSupplierId, invoiceNumber: invoiceStr },
            select: { id: true, dueDate: true, actionStatus: true },
          });
          if (existingPayable) matchedByInvoice = true;
        }

        // Tier 2: Fallback to supplier + amount + dueDate
        if (!existingPayable) {
          existingPayable = await prisma.payable.findFirst({
            where: { tenantId, supplierId: resolvedSupplierId, amount, dueDate: parsedDueDate },
            select: { id: true, dueDate: true, actionStatus: true },
          });
        }

        if (existingPayable) {
          const trackingDate =
            parsedOverdueTrackedAt ??
            (existingPayable.dueDate.getTime() !== parsedDueDate.getTime()
              ? parsedDueDate
              : null);

          // PAID guard: never downgrade a PAID record
          const existingIsPaid = existingPayable.actionStatus === "PAID";

          await prisma.payable.update({
            where: { id: existingPayable.id },
            data: matchedByInvoice
              ? {
                  ...(trackingDate ? { overdueTrackedAt: trackingDate, scheduledDate: trackingDate } : {}),
                  ...(tags.length > 0 ? { tags } : {}),
                  issueDate: parsedIssueDate,
                  amount,
                  payValue,
                  jurosMulta,
                  actionStatus: existingIsPaid ? undefined : importActionStatus,
                  paidAt: existingIsPaid ? undefined : paidAt,
                  markedPaidAt: existingIsPaid ? undefined : markedPaidAt,
                  description: supplierName,
                }
              : {
                  ...(trackingDate ? { overdueTrackedAt: trackingDate, scheduledDate: trackingDate } : {}),
                  ...(tags.length > 0 ? { tags } : {}),
                  actionStatus: existingIsPaid ? undefined : importActionStatus,
                  paidAt: existingIsPaid ? undefined : paidAt,
                  markedPaidAt: existingIsPaid ? undefined : markedPaidAt,
                  jurosMulta,
                },
          });
          stats.updated++;
          continue;
        }
      }

      // --- Create new payable ---
      await prisma.payable.create({
        data: {
          userId,
          tenantId,
          supplierId: resolvedSupplierId,
          payee: resolvedPayee,
          description: supplierName,
          amount,
          payValue,
          jurosMulta,
          issueDate: parsedIssueDate,
          dueDate: parsedDueDate,
          scheduledDate: parsedScheduledDate,
          ...(parsedOverdueTrackedAt ? { overdueTrackedAt: parsedOverdueTrackedAt } : {}),
          actionStatus: importActionStatus,
          source: "IMPORT",
          category,
          paymentMethod: "BOLETO", // Default — spreadsheet doesn't have consistent method data
          invoiceNumber: invoiceStr || null,
          notes: notesStr || null,
          tags,
          paidAt,
          markedPaidAt,
        },
      });
      stats.created++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      errors.push({ row: rowNum, reason: message });
      stats.errors++;
    }
  }

  // --- Print report ---
  console.log("Status breakdown:");
  console.log(`  temporal (a_vencer/vencido): ${stats.temporal}`);
  console.log(`  segurado (HELD):            ${stats.held}`);
  console.log(`  paid (PAID):                ${stats.paid}`);
  console.log();
  console.log("Supplier stats:");
  console.log(`  Existing suppliers matched:  ${stats.suppliersExisting}`);
  console.log(`  New suppliers to create:     ${stats.suppliersCreated}`);
  console.log();

  if (EXECUTE) {
    console.log(`Created: ${stats.created} payables`);
    console.log(`Updated: ${stats.updated} payables`);
    console.log(`Suppliers created: ${stats.suppliersCreated}`);
  } else {
    console.log(`Would create: ${stats.created} payables`);
    console.log(`Would update: ${stats.updated} payables`);
  }

  console.log(`Errors: ${stats.errors}`);

  if (errors.length > 0) {
    console.log("\nError details:");
    for (const e of errors.slice(0, 20)) {
      console.log(`  Row ${e.row}: ${e.reason}`);
    }
    if (errors.length > 20) {
      console.log(`  ... and ${errors.length - 20} more`);
    }
  }

  if (!EXECUTE) {
    console.log("\n--- DRY RUN --- No records written.");
    console.log("Run with --execute to apply.\n");
  } else {
    console.log("\nDone!");
  }
}

main()
  .catch((err) => {
    console.error("Import failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
