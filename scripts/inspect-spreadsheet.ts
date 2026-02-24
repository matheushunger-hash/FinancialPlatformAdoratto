import "dotenv/config";
import * as XLSX from "xlsx";

const filePath = "planilhabase/newspreadsheet.xlsx";
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);

console.log(`Sheet: "${sheetName}", ${rows.length} rows\n`);
console.log("Column headers:", Object.keys(rows[0]));

// Find rows with "segurado" in any column
const seguradoRows = rows.filter((r) =>
  Object.values(r).some(
    (v) => typeof v === "string" && /segurado/i.test(v),
  ),
);

console.log(`\nRows with "segurado": ${seguradoRows.length}`);
console.log("\nFirst 5 segurado rows (all columns):");
for (const row of seguradoRows.slice(0, 5)) {
  console.log(JSON.stringify(row, null, 2));
  console.log("---");
}

// Check which column contains "segurado"
const seguradoCols = new Set<string>();
for (const row of seguradoRows) {
  for (const [key, val] of Object.entries(row)) {
    if (typeof val === "string" && /segurado/i.test(val)) {
      seguradoCols.add(key);
    }
  }
}
console.log(`\nColumns containing "segurado": ${[...seguradoCols].join(", ")}`);

// Show the specific OBRA PRIMA R$7484.58 row
const obraPrima = rows.filter(
  (r) =>
    Object.values(r).some(
      (v) => typeof v === "string" && /OBRA PRIMA/i.test(v),
    ) &&
    Object.values(r).some((v) => v === 7484.58 || v === "7484.58" || v === "7.484,58"),
);
console.log(`\nOBRA PRIMA R$7484.58 rows: ${obraPrima.length}`);
for (const row of obraPrima) {
  console.log(JSON.stringify(row, null, 2));
}
