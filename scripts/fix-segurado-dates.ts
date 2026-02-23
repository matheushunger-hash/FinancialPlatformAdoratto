/**
 * fix-segurado-dates.ts
 * ---------------------------------------------------------------------------
 * Reads the spreadsheet and finds rows with "segurado DD/MM" in the Obs
 * column. For each, it updates the payable's dueDate from the original
 * spreadsheet date to the segurado (actual expiry) date.
 *
 * Usage:
 *   npx tsx scripts/fix-segurado-dates.ts           # dry-run (show changes)
 *   npx tsx scripts/fix-segurado-dates.ts --apply    # apply changes to DB
 * ---------------------------------------------------------------------------
 */

import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DRY_RUN = !process.argv.includes("--apply");

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Convert Excel serial date to "YYYY-MM-DD" (same logic as import parsing) */
function excelDateToISO(serial: number): string {
  const excelEpoch = new Date(1899, 11, 31); // Dec 31, 1899
  const dayOffset = serial > 60 ? serial - 1 : serial; // Lotus bug fix
  const date = new Date(excelEpoch.getTime() + dayOffset * 86_400_000);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parse "segurado DD/MM" → "YYYY-MM-DD"
 *
 * Year logic: the spreadsheet is Feb 2026.
 *   - Months 1-2 → 2026 (Jan/Feb are within the spreadsheet period)
 *   - Months 3-12 → 2025 (Mar–Dec are before Feb 2026, so previous year)
 */
const SEGURADO_REGEX = /segurado\s*(\d{1,2})\/(\d{1,2})/i;

function parseSeguradoDate(obs: string): string | null {
  const match = obs.match(SEGURADO_REGEX);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const year = month <= 2 ? 2026 : 2025;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** Strip CNPJ/CPF formatting: "06.136.910/0003-44" → "06136910000344" */
function stripDocument(doc: string): string {
  return doc.replace(/[.\-/]/g, "");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface SpreadsheetRow {
  "Pago?": string;
  Conta: string;
  "Data de Entrada": number;
  Fornecedor: string;
  CNPJ: string;
  "-": string;
  "Nota Fiscal": string;
  Obs?: string;
  Data: number;
  Valor: number;
  "Valor a Pagar": number;
  "-_1"?: number;
  "Excluídas"?: string;
  "Mês Ref."?: string;
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== APPLYING CHANGES ===");
  console.log();

  // Step 1: Read spreadsheet
  const workbook = XLSX.readFile("planilhabase/newspreadsheet.xlsx");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<SpreadsheetRow>(sheet);

  // Step 2: Find rows with "segurado" in Obs
  const seguradoRows: Array<{
    row: SpreadsheetRow;
    seguradoDate: string;
    originalDueDate: string;
  }> = [];

  for (const row of rows) {
    const obs = row.Obs;
    if (!obs || !SEGURADO_REGEX.test(obs)) continue;

    const seguradoDate = parseSeguradoDate(obs);
    if (!seguradoDate) continue;

    const dataSerial = row.Data;
    if (typeof dataSerial !== "number") continue;

    const originalDueDate = excelDateToISO(dataSerial);
    seguradoRows.push({ row, seguradoDate, originalDueDate });
  }

  console.log(`Found ${seguradoRows.length} rows with "segurado" dates\n`);

  // Step 3: Build a supplier CNPJ → supplierId map
  // Strip formatting from spreadsheet CNPJs to match DB format (digits only)
  const uniqueCNPJs = [
    ...new Set(
      seguradoRows
        .map((r) => r.row.CNPJ)
        .filter(Boolean)
        .map(stripDocument),
    ),
  ];
  const suppliers = await prisma.supplier.findMany({
    where: { document: { in: uniqueCNPJs } },
    select: { id: true, document: true, name: true },
  });
  const cnpjToSupplier = new Map(suppliers.map((s) => [s.document, s]));

  console.log(`Matched ${cnpjToSupplier.size} / ${uniqueCNPJs.length} unique CNPJs to suppliers\n`);

  // Step 4: Match each segurado row to a payable and prepare updates
  let matched = 0;
  let notFound = 0;
  let ambiguous = 0;
  let alreadyCorrect = 0;
  let updated = 0;

  const updates: Array<{
    payableId: string;
    supplierName: string;
    payValue: number;
    oldDueDate: string;
    newDueDate: string;
    status: string;
  }> = [];

  for (const { row, seguradoDate, originalDueDate } of seguradoRows) {
    const supplier = cnpjToSupplier.get(stripDocument(row.CNPJ ?? ""));
    if (!supplier) {
      // No supplier match — skip silently (CNPJ not in DB)
      notFound++;
      continue;
    }

    const payValue = row["Valor a Pagar"];
    if (typeof payValue !== "number" || payValue <= 0) {
      notFound++;
      continue;
    }

    // Match by supplierId + payValue + current dueDate (the original from import)
    // The dueDate in the DB should match the "Data" column from the spreadsheet
    const dueDateStart = new Date(originalDueDate + "T00:00:00.000Z");
    const dueDateEnd = new Date(originalDueDate + "T23:59:59.999Z");

    const candidates = await prisma.payable.findMany({
      where: {
        supplierId: supplier.id,
        payValue: payValue,
        dueDate: { gte: dueDateStart, lte: dueDateEnd },
      },
      select: { id: true, status: true, dueDate: true, payValue: true },
    });

    if (candidates.length === 0) {
      notFound++;
      continue;
    }

    if (candidates.length > 1) {
      // Multiple matches — same supplier + amount + dueDate
      // Update all of them (they all have the same segurado date)
      ambiguous++;
    }

    for (const payable of candidates) {
      const currentDue = payable.dueDate.toISOString().split("T")[0];

      if (currentDue === seguradoDate) {
        alreadyCorrect++;
        continue;
      }

      matched++;
      updates.push({
        payableId: payable.id,
        supplierName: supplier.name,
        payValue: Number(payable.payValue),
        oldDueDate: currentDue,
        newDueDate: seguradoDate,
        status: payable.status,
      });
    }
  }

  // Step 5: Show summary
  console.log("=== SUMMARY ===");
  console.log(`  Segurado rows in spreadsheet: ${seguradoRows.length}`);
  console.log(`  Matched to payables:          ${matched}`);
  console.log(`  Already correct:              ${alreadyCorrect}`);
  console.log(`  Not found in DB:              ${notFound}`);
  console.log(`  Ambiguous (multi-match):       ${ambiguous}`);
  console.log();

  if (updates.length === 0) {
    console.log("Nothing to update!");
    await cleanup();
    return;
  }

  // Show first 30 updates as preview
  console.log(`=== UPDATES (${updates.length} total, showing first 30) ===`);
  for (const u of updates.slice(0, 30)) {
    console.log(
      `  ${u.supplierName.substring(0, 35).padEnd(35)} | R$${String(u.payValue).padStart(10)} | ${u.oldDueDate} → ${u.newDueDate} | ${u.status}`,
    );
  }
  if (updates.length > 30) {
    console.log(`  ... and ${updates.length - 30} more`);
  }

  // Show breakdown by status
  const byStatus = new Map<string, number>();
  for (const u of updates) {
    byStatus.set(u.status, (byStatus.get(u.status) ?? 0) + 1);
  }
  console.log("\n  By status:");
  for (const [status, count] of byStatus) {
    console.log(`    ${status}: ${count}`);
  }

  // Step 6: Apply if not dry run
  if (!DRY_RUN) {
    console.log("\nApplying updates...");
    for (const u of updates) {
      await prisma.payable.update({
        where: { id: u.payableId },
        data: {
          dueDate: new Date(u.newDueDate + "T12:00:00"), // noon trick
        },
      });
      updated++;
    }
    console.log(`\nDone! Updated ${updated} payables.`);
  } else {
    console.log("\n>>> This was a DRY RUN. Run with --apply to execute changes.");
  }

  await cleanup();
}

async function cleanup() {
  await (prisma as any).$disconnect();
  await pool.end();
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await cleanup();
  process.exit(1);
});
