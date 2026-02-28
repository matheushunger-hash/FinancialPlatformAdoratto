import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { parseCurrency } from "@/lib/payables/validation";
import { isValidCNPJ, isValidCPF } from "@/lib/suppliers/validation";
import { parseImportDate, processImportDocument, normalizeName } from "@/lib/import/parsing";
import type {
  ColumnMapping,
  ImportDefaults,
  ImportError,
  ImportResponse,
  RawRow,
  TargetFieldKey,
} from "@/lib/import/types";
import { REQUIRED_FIELDS } from "@/lib/import/types";

// =============================================================================
// POST /api/import — Process mapped spreadsheet rows into payables
// =============================================================================
// Receives JSON with rows, column mapping, and default values.
// For each row:
//   1. Extract values using the mapping
//   2. Validate required fields
//   3. Find-or-create supplier (with dedup cache)
//   4. Create payable (status: PENDING)
//
// Per-row atomicity: one failure doesn't block others. Errors are collected
// with row numbers and returned alongside the success count.
// =============================================================================

const MAX_ROWS = 1000;

const VALID_CATEGORIES = ["REVENDA", "DESPESA"];
const VALID_METHODS = ["BOLETO", "PIX", "TRANSFERENCIA", "CARTAO", "DINHEIRO", "CHEQUE", "TAX_SLIP", "PAYROLL"];

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Extract once so TypeScript knows these are non-null inside nested functions
  const { userId, tenantId } = ctx;

  let body: { rows: RawRow[]; mapping: ColumnMapping[]; defaults: ImportDefaults; updateExisting?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { rows, mapping, defaults, updateExisting = false } = body;

  // --- Basic validation ---
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Nenhuma linha para importar" }, { status: 400 });
  }

  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Máximo de ${MAX_ROWS} linhas por importação` },
      { status: 400 },
    );
  }

  if (!Array.isArray(mapping)) {
    return NextResponse.json({ error: "Mapeamento de colunas inválido" }, { status: 400 });
  }

  // Build field map: targetField → sourceColumn for quick lookups
  const fieldMap = new Map<string, string>();
  for (const m of mapping) {
    if (m.targetField !== "ignore") {
      fieldMap.set(m.targetField, m.sourceColumn);
    }
  }

  // Verify required fields are mapped
  const missingRequired = REQUIRED_FIELDS.filter((f) => !fieldMap.has(f));
  if (missingRequired.length > 0) {
    return NextResponse.json(
      { error: `Campos obrigatórios não mapeados: ${missingRequired.join(", ")}` },
      { status: 400 },
    );
  }

  // --- Prepare supplier dedup cache ---
  // Key: document digits (or "name:lowercased_name") → supplier ID
  const supplierCache = new Map<string, string>();

  // Find the max existing PENDENTE-NNN number to avoid collisions
  let pendenteCounter = 0;
  try {
    const maxPendente = await prisma.supplier.findFirst({
      where: {
        tenantId: tenantId,
        document: { startsWith: "PENDENTE-" },
      },
      orderBy: { document: "desc" },
      select: { document: true },
    });

    if (maxPendente) {
      const num = parseInt(maxPendente.document.replace("PENDENTE-", ""), 10);
      if (!isNaN(num)) pendenteCounter = num;
    }
  } catch {
    // If query fails, start from 0 — worst case we get a collision that
    // the unique constraint will catch
  }

  // --- Pattern matching for salary/tax payees ---
  const SALARY_PATTERNS = /^(SALARIO|SALÁRIO|FERIAS|FÉRIAS|RESCIS[ÃA]O|13º?\s*SAL|ADIANTAMENTO)\b/i;
  const TAX_KEYWORDS = ["FGTS", "INSS", "DAS", "ICMS ST", "SEFAZ"];

  // Cache for tax supplier lookups (name prefix → supplierId)
  const taxSupplierCache = new Map<string, string>();

  async function findTaxSupplier(keyword: string): Promise<string | null> {
    const cached = taxSupplierCache.get(keyword);
    if (cached) return cached;

    const supplier = await prisma.supplier.findFirst({
      where: {
        tenantId,
        name: { startsWith: keyword, mode: "insensitive" },
        active: true,
      },
      select: { id: true },
    });

    if (supplier) {
      taxSupplierCache.set(keyword, supplier.id);
      return supplier.id;
    }
    return null;
  }

  // --- Helper: get a cell value from a row using the field map ---
  function getField(row: RawRow, field: TargetFieldKey): unknown {
    const sourceCol = fieldMap.get(field);
    if (!sourceCol) return undefined;
    return row[sourceCol];
  }

  // --- Helper: find or create a supplier ---
  async function findOrCreateSupplier(
    name: string,
    rawDocument: unknown,
  ): Promise<{ id: string; created: boolean }> {
    const { digits, documentType } = processImportDocument(rawDocument);

    // Strategy 1: Has document → lookup by document + tenantId
    if (digits.length > 0) {
      const cacheKey = digits;
      const cached = supplierCache.get(cacheKey);
      if (cached) return { id: cached, created: false };

      // Validate document (import anyway, just log)
      if (documentType === "CNPJ" && digits.length === 14) {
        isValidCNPJ(digits); // Log-only validation
      } else if (documentType === "CPF" && digits.length === 11) {
        isValidCPF(digits); // Log-only validation
      }

      // Find by document + tenant (using findFirst for @@unique compatibility)
      const existing = await prisma.supplier.findFirst({
        where: { document: digits, tenantId: tenantId },
        select: { id: true },
      });

      if (existing) {
        supplierCache.set(cacheKey, existing.id);
        return { id: existing.id, created: false };
      }

      // Create new supplier
      const created = await prisma.supplier.create({
        data: {
          userId: userId,
          tenantId: tenantId,
          name,
          documentType,
          document: digits,
          active: true,
        },
        select: { id: true },
      });

      supplierCache.set(cacheKey, created.id);
      return { id: created.id, created: true };
    }

    // Strategy 2: No document → lookup by exact name (case-insensitive)
    const nameLower = name.toLowerCase();
    const cacheKey = `name:${nameLower}`;
    const cached = supplierCache.get(cacheKey);
    if (cached) return { id: cached, created: false };

    const existing = await prisma.supplier.findFirst({
      where: {
        tenantId: tenantId,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (existing) {
      supplierCache.set(cacheKey, existing.id);
      return { id: existing.id, created: false };
    }

    // Create with PENDENTE placeholder
    pendenteCounter++;
    const placeholder = `PENDENTE-${String(pendenteCounter).padStart(3, "0")}`;

    const created = await prisma.supplier.create({
      data: {
        userId: userId,
        tenantId: tenantId,
        name,
        documentType: "CNPJ",
        document: placeholder,
        active: true,
      },
      select: { id: true },
    });

    supplierCache.set(cacheKey, created.id);
    return { id: created.id, created: true };
  }

  // --- Process rows ---
  let createdCount = 0;
  let updatedCount = 0;
  let suppliersCreatedCount = 0;
  const errors: ImportError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 because row 1 is headers, 0-indexed

    try {
      // Extract required fields
      const rawSupplierName = getField(row, "supplierName");
      const rawDescription = getField(row, "description");
      const rawAmount = getField(row, "amount");
      const rawDueDate = getField(row, "dueDate");

      // Validate supplier name
      const supplierName = normalizeName(String(rawSupplierName || ""));
      if (!supplierName) {
        errors.push({ row: rowNum, reason: "Nome do fornecedor vazio" });
        continue;
      }

      // Description falls back to supplier name when not mapped or empty
      const description = String(rawDescription || "").trim() || supplierName;

      // Parse and validate amount
      const amountStr = String(rawAmount || "").trim();
      if (!amountStr) {
        errors.push({ row: rowNum, reason: "Valor original vazio" });
        continue;
      }
      const amount = parseCurrency(amountStr);
      if (isNaN(amount) || amount <= 0) {
        errors.push({ row: rowNum, reason: `Valor original inválido: "${amountStr}"` });
        continue;
      }

      // Parse and validate due date
      const dueDate = parseImportDate(rawDueDate);
      if (!dueDate) {
        errors.push({ row: rowNum, reason: `Data de vencimento inválida: "${String(rawDueDate || "")}"` });
        continue;
      }

      // Parse optional fields
      const rawIssueDate = getField(row, "issueDate");
      const issueDate = parseImportDate(rawIssueDate) || dueDate; // Default to dueDate

      const rawPayValue = getField(row, "payValue");
      let payValue = amount; // Default to amount
      if (rawPayValue != null && String(rawPayValue).trim()) {
        const parsed = parseCurrency(String(rawPayValue).trim());
        if (!isNaN(parsed) && parsed > 0) payValue = parsed;
      }

      // Category — from mapped column or defaults
      const rawCategory = getField(row, "category");
      let category = defaults.category;
      if (rawCategory != null) {
        const cat = String(rawCategory).trim().toUpperCase();
        if (VALID_CATEGORIES.includes(cat)) category = cat as typeof category;
      }

      // Payment method — from mapped column or defaults
      const rawMethod = getField(row, "paymentMethod");
      let paymentMethod = defaults.paymentMethod;
      if (rawMethod != null) {
        const method = String(rawMethod).trim().toUpperCase();
        if (VALID_METHODS.includes(method)) paymentMethod = method as typeof paymentMethod;
      }

      // Optional string fields
      const invoiceNumber = getField(row, "invoiceNumber");
      const invoiceStr = invoiceNumber != null ? String(invoiceNumber).trim() : null;

      const notes = getField(row, "notes");
      const notesStr = notes != null ? String(notes).trim() : null;

      const rawTags = getField(row, "tags");
      let tags: string[] = [];
      if (rawTags != null) {
        const tagStr = String(rawTags).trim();
        if (tagStr) {
          tags = tagStr.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
        }
      }

      // Compute juros/multa (interest/penalty)
      const jurosMulta = payValue > amount ? payValue - amount : 0;

      // Detect overdue payables from "Excluídas" column (#96)
      // The cell may contain various formats:
      //   "segurado"          — clean (separate Mês Ref column has the date)
      //   "-segurado 10/02"   — date embedded in same cell
      //   "- segurado 20/01"  — with spaces
      //   "-segurado13/02"    — no space before date
      //   "-segurado 10/02 vai para cartorio" — extra text after date
      const rawExcludedTag = String(getField(row, "excludedTag") || "").trim();
      const isSegurado = /segurado/i.test(rawExcludedTag);

      // Try to extract embedded date from the Excluídas cell (e.g., "-segurado 10/02")
      const embeddedDateMatch = rawExcludedTag.match(/(\d{1,2})\/(\d{1,2})/);
      const embeddedDate = embeddedDateMatch
        ? parseImportDate(`${embeddedDateMatch[1]}/${embeddedDateMatch[2]}`)
        : null;

      // Mês Ref column (separate) takes priority, embedded date is fallback
      const rawRefDate = getField(row, "refDate");
      const refDate = parseImportDate(rawRefDate) ?? embeddedDate;

      // Auto-add "segurado" tag when detected from "Excluídas" column
      if (isSegurado && !tags.includes("segurado")) {
        tags.push("segurado");
      }

      // Determine paid status from the "Pago?" column
      const rawPaidStatus = getField(row, "paidStatus");
      const isPaid = /^sim$/i.test(String(rawPaidStatus || "").trim());
      const paidAt = isPaid ? new Date() : null;
      const markedPaidAt = isPaid ? new Date() : null;

      // Determine actionStatus from import data
      // Paid takes precedence, then segurado, else null (temporal)
      const importActionStatus = isPaid ? "PAID" : (isSegurado ? "HELD" : null);
      // actionStatus determines the stored workflow state

      // Determine supplier vs payee based on name patterns
      const rawDocument = getField(row, "document");
      let resolvedSupplierId: string | null = null;
      let resolvedPayee: string | null = null;

      if (SALARY_PATTERNS.test(supplierName)) {
        // Salary/HR payments → payee only, no supplier record
        resolvedPayee = supplierName;
      } else {
        // Check if it's a tax payment
        const taxKeyword = TAX_KEYWORDS.find((k) =>
          supplierName.toUpperCase().startsWith(k),
        );
        if (taxKeyword) {
          const taxSupplierId = await findTaxSupplier(taxKeyword);
          if (taxSupplierId) {
            resolvedSupplierId = taxSupplierId;
          } else {
            // No generic tax supplier found — fall through to normal flow
            const supplier = await findOrCreateSupplier(supplierName, rawDocument);
            if (supplier.created) suppliersCreatedCount++;
            resolvedSupplierId = supplier.id;
          }
        } else {
          // Normal flow — find or create supplier
          const supplier = await findOrCreateSupplier(supplierName, rawDocument);
          if (supplier.created) suppliersCreatedCount++;
          resolvedSupplierId = supplier.id;
        }
      }

      const parsedIssueDate = new Date(issueDate + "T12:00:00");

      // For overdue items ("segurado" + ref date), the spreadsheet's "Vencimento"
      // has the rolling date and "Mês Ref." has the real original due date.
      // Swap: dueDate ← refDate (original), overdueTrackedAt ← vencimento (rolling)
      const vencimentoDate = new Date(dueDate + "T12:00:00");
      let resolvedRefDate = refDate;
      // "dd/mm" dates infer current year, but segurado ref dates are always in the
      // past — if the parsed date is in the future, it belongs to the previous year.
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
      const parsedDueDate = (isSegurado && resolvedRefDate)
        ? new Date(resolvedRefDate + "T12:00:00")
        : vencimentoDate;
      const parsedOverdueTrackedAt = (isSegurado && resolvedRefDate)
        ? vencimentoDate
        : null;
      // scheduledDate: segurado uses rolling date, others use dueDate
      const parsedScheduledDate = (isSegurado && resolvedRefDate)
        ? vencimentoDate
        : parsedDueDate;

      // Update mode: two-tier matching strategy
      // Tier 1: invoiceNumber (stable across date/amount changes)
      // Tier 2: supplier + amount + dueDate (fallback when no invoice number)
      // dueDate is NEVER overwritten — overdueTrackedAt captures rolling dates (#96)
      if (updateExisting && resolvedSupplierId) {
        let existing: { id: string; dueDate: Date; actionStatus: string | null } | null = null;
        let matchedByInvoice = false;

        // Tier 1: Match by invoice number (stable across date/amount changes)
        if (invoiceStr) {
          existing = await prisma.payable.findFirst({
            where: {
              tenantId,
              supplierId: resolvedSupplierId,
              invoiceNumber: invoiceStr,
            },
            select: { id: true, dueDate: true, actionStatus: true },
          });
          if (existing) matchedByInvoice = true;
        }

        // Tier 2: Fallback to original matching (no invoice number or no Tier 1 match)
        if (!existing) {
          existing = await prisma.payable.findFirst({
            where: {
              tenantId,
              supplierId: resolvedSupplierId,
              amount,
              dueDate: parsedDueDate,
            },
            select: { id: true, dueDate: true, actionStatus: true },
          });
        }

        if (existing) {
          // Set overdueTrackedAt from "segurado" swap or when dates differ
          const trackingDate = parsedOverdueTrackedAt
            ?? (existing.dueDate.getTime() !== parsedDueDate.getTime() ? parsedDueDate : null);

          // Guard: never downgrade a PAID record via import.
          // Reversing payment should only happen through the UI transition workflow.
          // In Prisma, `undefined` means "don't touch this field".
          const existingIsPaid = existing.actionStatus === "PAID";

          await prisma.payable.update({
            where: { id: existing.id },
            data: matchedByInvoice
              ? {
                  // Confident match — safe to update financial fields (but NOT dueDate)
                  ...(trackingDate ? { overdueTrackedAt: trackingDate, scheduledDate: trackingDate } : {}),
                  ...(tags.length > 0 ? { tags } : {}),
                  issueDate: parsedIssueDate,
                  amount,
                  payValue,
                  jurosMulta,
                  actionStatus: existingIsPaid ? undefined : importActionStatus,
                  paidAt: existingIsPaid ? undefined : paidAt,
                  markedPaidAt: existingIsPaid ? undefined : markedPaidAt,
                  description,
                }
              : {
                  // Heuristic match — conservative update only
                  ...(trackingDate ? { overdueTrackedAt: trackingDate, scheduledDate: trackingDate } : {}),
                  ...(tags.length > 0 ? { tags } : {}),
                  actionStatus: existingIsPaid ? undefined : importActionStatus,
                  paidAt: existingIsPaid ? undefined : paidAt,
                  markedPaidAt: existingIsPaid ? undefined : markedPaidAt,
                  jurosMulta,
                },
          });
          updatedCount++;
          continue; // Skip creation — we updated instead
        }
      }

      // Create payable — dates use T12:00:00 noon trick per timezone rules
      await prisma.payable.create({
        data: {
          userId: userId,
          tenantId: tenantId,
          supplierId: resolvedSupplierId,
          payee: resolvedPayee,
          description,
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
          paymentMethod,
          invoiceNumber: invoiceStr || null,
          notes: notesStr || null,
          tags,
          paidAt,
          markedPaidAt,
        },
      });

      createdCount++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      errors.push({ row: rowNum, reason: message });
    }
  }

  const response: ImportResponse = {
    created: createdCount,
    updated: updatedCount,
    suppliersCreated: suppliersCreatedCount,
    errors,
  };

  return NextResponse.json(response);
}
