import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, DocumentType, Role } from "@prisma/client";
import * as XLSX from "xlsx";
import * as path from "path";
import { isValidCNPJ, isValidCPF } from "../src/lib/suppliers/validation";

// =============================================================================
// Import Suppliers from Spreadsheet (ADR-006)
// =============================================================================
// Reads an Excel file with two columns (Fornecedor, CNPJ) and imports each row
// into the suppliers table. Handles messy real-world data: scientific notation,
// masked CPFs, missing documents, duplicates, etc.
//
// Usage: npm run db:import-suppliers
// =============================================================================

// --- Database setup (same pattern as prisma/seed.ts) ---
const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// --- Spreadsheet path ---
const SPREADSHEET_PATH = path.resolve(
  __dirname,
  "../planilhabase/Planilha sem título (3).xlsx",
);

// --- Counters for the summary report ---
const stats = {
  totalRows: 0,
  imported: 0,
  importedNoDoc: 0,
  skippedDuplicate: 0,
  skippedEmpty: 0,
  invalidDocument: 0,
};

// Track documents we've already imported (to catch duplicates within the file)
const seenDocuments = new Map<string, string>(); // document → supplier name

// Counter for generating unique placeholders for no-document suppliers
let noDocCounter = 0;

// =============================================================================
// Row processing helpers
// =============================================================================

/**
 * Check if a raw cell value looks like a masked CPF (contains asterisks).
 * Example: "***.809.559-**"
 */
function isMaskedDocument(value: string): boolean {
  return value.includes("*");
}

/**
 * Check if a raw cell value is effectively empty or invalid.
 * Catches: empty strings, "-", whitespace-only, etc.
 */
function isEmptyOrInvalid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === "" || trimmed === "-" || trimmed === ",";
}

/**
 * Process a raw CNPJ/document cell value into clean digits.
 *
 * Handles three cases:
 * 1. Number (scientific notation from Excel) → convert to integer string, pad to 14 digits
 * 2. String with formatting → strip non-digits
 * 3. Masked/empty/invalid → return "" (no document)
 */
function processDocument(raw: unknown): { digits: string; documentType: DocumentType } {
  // Case: cell is a number (Excel stored CNPJ as a number, possibly scientific notation)
  if (typeof raw === "number") {
    // Math.round handles floating point precision issues from scientific notation.
    // Example: 7.66492E+13 → 76649200000000 → pad to 14 digits → "76649200000000"
    const asString = Math.round(raw).toString();
    const padded = asString.padStart(14, "0");
    return { digits: padded, documentType: "CNPJ" };
  }

  // Case: cell is a string
  if (typeof raw === "string") {
    if (isMaskedDocument(raw) || isEmptyOrInvalid(raw)) {
      return { digits: "", documentType: "CNPJ" }; // No usable document
    }

    // Strip formatting characters (dots, slashes, dashes)
    const digits = raw.replace(/\D/g, "");

    if (digits.length === 11) {
      return { digits, documentType: "CPF" };
    }
    if (digits.length === 14) {
      return { digits, documentType: "CNPJ" };
    }

    // Odd length — could be a partial document. Treat as no document.
    if (digits.length === 0) {
      return { digits: "", documentType: "CNPJ" };
    }

    // Has some digits but not 11 or 14 — log and treat as no document
    console.warn(`  [WARN] Unexpected document length (${digits.length} digits): "${raw}"`);
    return { digits: "", documentType: "CNPJ" };
  }

  // Case: undefined, null, or other type
  return { digits: "", documentType: "CNPJ" };
}

/**
 * Normalize a supplier name: trim whitespace, collapse multiple spaces,
 * remove trailing commas/punctuation.
 */
function normalizeName(raw: string): string {
  return raw
    .trim()
    .replace(/[,;]+$/, "") // Remove trailing commas/semicolons
    .replace(/\s+/g, " ") // Collapse multiple spaces into one
    .trim();
}

// =============================================================================
// Main import function
// =============================================================================

async function main() {
  console.log("=== ADR-006: Import Suppliers from Spreadsheet ===\n");

  // --- Step 1: Find the user who will "own" the imported suppliers ---
  // Every supplier needs a userId (foreign key). We use the first ADMIN user
  // in the database — this is the same approach the seed script uses.
  const adminUser = await prisma.user.findFirst({
    where: { role: Role.ADMIN },
    orderBy: { createdAt: "asc" },
  });

  if (!adminUser) {
    throw new Error(
      "No ADMIN user found in the database. Run `npm run db:seed` first.",
    );
  }

  console.log(`Using user: ${adminUser.name} (${adminUser.id})\n`);

  // --- Step 2: Read the spreadsheet ---
  console.log(`Reading: ${SPREADSHEET_PATH}\n`);
  const workbook = XLSX.readFile(SPREADSHEET_PATH);

  // Get the first (and only) sheet
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert to JSON array. Each element is an object with column headers as keys.
  // { raw: true } keeps numbers as numbers instead of auto-formatting them,
  // which is critical for scientific notation CNPJs.
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: true,
  });

  stats.totalRows = rows.length;
  console.log(`Found ${rows.length} rows in sheet "${sheetName}"\n`);

  // --- Step 3: Process each row ---
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawName = row["Fornecedor"];
    const rawDoc = row["CNPJ"];

    // Skip completely empty rows
    if (!rawName && !rawDoc) {
      stats.skippedEmpty++;
      continue;
    }

    // Process the name
    const name = normalizeName(String(rawName || "").trim());
    if (!name) {
      stats.skippedEmpty++;
      console.log(`  [SKIP] Row ${i + 2}: empty name`);
      continue;
    }

    // Process the document
    const { digits, documentType } = processDocument(rawDoc);

    // --- Handle suppliers WITH a valid document ---
    if (digits.length > 0) {
      // Check for duplicate documents within the spreadsheet
      if (seenDocuments.has(digits)) {
        stats.skippedDuplicate++;
        console.log(
          `  [DUP]  Row ${i + 2}: "${name}" — document ${digits} already imported as "${seenDocuments.get(digits)}"`,
        );
        continue;
      }

      // Validate the document (log warning but import anyway)
      if (documentType === "CNPJ" && !isValidCNPJ(digits)) {
        stats.invalidDocument++;
        console.warn(
          `  [WARN] Row ${i + 2}: "${name}" — CNPJ ${digits} fails check-digit validation`,
        );
      } else if (documentType === "CPF" && !isValidCPF(digits)) {
        stats.invalidDocument++;
        console.warn(
          `  [WARN] Row ${i + 2}: "${name}" — CPF ${digits} fails check-digit validation`,
        );
      }

      // Find-then-create/update pattern — Prisma's upsert doesn't work with
      // model-level @@unique constraints (only field-level @unique and @id).
      // This is a known Prisma limitation documented in our CLAUDE.md.
      seenDocuments.set(digits, name);

      const existingByDoc = await prisma.supplier.findFirst({
        where: { document: digits },
      });

      if (existingByDoc) {
        await prisma.supplier.update({
          where: { id: existingByDoc.id },
          data: { name, documentType, active: true },
        });
      } else {
        await prisma.supplier.create({
          data: {
            userId: adminUser.id,
            name,
            documentType,
            document: digits,
            active: true,
          },
        });
      }

      stats.imported++;
      console.log(`  [OK]   Row ${i + 2}: "${name}" — ${documentType} ${digits}`);
    } else {
      // --- Handle suppliers WITHOUT a document ---
      // Generate a unique placeholder so the DB unique constraint isn't violated.
      // Format: "PENDENTE-001" — clearly shows this needs a real document later.
      noDocCounter++;
      const placeholder = `PENDENTE-${String(noDocCounter).padStart(3, "0")}`;

      // Check if a supplier with this exact name already exists (avoid name dupes)
      const existing = await prisma.supplier.findFirst({
        where: { name, userId: adminUser.id },
      });

      if (existing) {
        stats.skippedDuplicate++;
        console.log(
          `  [DUP]  Row ${i + 2}: "${name}" — no document, name already exists`,
        );
        continue;
      }

      await prisma.supplier.create({
        data: {
          userId: adminUser.id,
          name,
          documentType: "CNPJ", // Default — will be corrected when real doc is added
          document: placeholder,
          active: true,
        },
      });

      stats.importedNoDoc++;
      console.log(
        `  [OK]   Row ${i + 2}: "${name}" — no document (placeholder: ${placeholder})`,
      );
    }
  }

  // --- Step 4: Print summary ---
  console.log("\n=== Import Summary ===");
  console.log(`Total rows read:              ${stats.totalRows}`);
  console.log(`Imported (with document):     ${stats.imported}`);
  console.log(`Imported (no document):       ${stats.importedNoDoc}`);
  console.log(`Skipped (duplicate):          ${stats.skippedDuplicate}`);
  console.log(`Skipped (empty row):          ${stats.skippedEmpty}`);
  console.log(`Invalid CNPJ/CPF (imported):  ${stats.invalidDocument}`);
  console.log(
    `\nTotal in database: ${stats.imported + stats.importedNoDoc} new suppliers`,
  );
}

main()
  .catch((e) => {
    console.error("\nImport failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
