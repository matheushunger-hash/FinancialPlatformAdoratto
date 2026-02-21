import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { payableFormSchema, parseCurrency } from "@/lib/payables/validation";
import type { PayablesListResponse } from "@/lib/payables/types";

// =============================================================================
// GET /api/payables — List payables with pagination, sorting, and search
// =============================================================================
// Returns payables with supplier data joined in. Supports server-side sorting,
// search across description/supplier name/invoice number, and pagination (25/page).
// =============================================================================

// Whitelist of sortable columns → Prisma orderBy mapping
type PrismaOrder = Record<string, unknown>;
const SORT_MAP: Record<string, (order: "asc" | "desc") => PrismaOrder> = {
  supplierName: (order) => ({ supplier: { name: order } }),
  dueDate: (order) => ({ dueDate: order }),
  amount: (order) => ({ amount: order }),
  payValue: (order) => ({ payValue: order }),
  status: (order) => ({ status: order }),
};

// Whitelist of valid filter values — unknown values are silently ignored
const VALID_STATUSES = ["PENDING", "PAID", "OVERDUE", "CANCELLED"];
const VALID_CATEGORIES = ["REVENDA", "DESPESA"];
const VALID_METHODS = [
  "BOLETO",
  "PIX",
  "TRANSFERENCIA",
  "CARTAO",
  "DINHEIRO",
  "CHEQUE",
];

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(
    50,
    Math.max(1, Number(searchParams.get("pageSize")) || 25),
  );

  // Sorting — default to dueDate desc
  const sortParam = searchParams.get("sort") || "dueDate";
  const orderParam =
    searchParams.get("order") === "asc" ? "asc" : ("desc" as const);
  const buildOrderBy = SORT_MAP[sortParam] ?? SORT_MAP.dueDate;
  const orderBy = buildOrderBy(orderParam);

  // Build combined WHERE clause — each active filter pushes a condition.
  // All conditions are ANDed: search "Acme" + status OVERDUE → both must match.
  const conditions: Record<string, unknown>[] = [];

  // Search — expanded to include notes and supplier document (CNPJ/CPF)
  const searchTerm = searchParams.get("search")?.trim() || "";
  if (searchTerm) {
    conditions.push({
      OR: [
        { description: { contains: searchTerm, mode: "insensitive" } },
        { supplier: { name: { contains: searchTerm, mode: "insensitive" } } },
        { invoiceNumber: { contains: searchTerm, mode: "insensitive" } },
        { notes: { contains: searchTerm, mode: "insensitive" } },
        { supplier: { document: { contains: searchTerm, mode: "insensitive" } } },
      ],
    });
  }

  // Filters — validated against whitelists, unknown values silently ignored
  const statusParam = searchParams.get("status") || "";
  if (VALID_STATUSES.includes(statusParam)) {
    conditions.push({ status: statusParam });
  }

  const tagParam = searchParams.get("tag")?.trim() || "";
  if (tagParam) {
    conditions.push({ tags: { hasSome: [tagParam] } });
  }

  const categoryParam = searchParams.get("category") || "";
  if (VALID_CATEGORIES.includes(categoryParam)) {
    conditions.push({ category: categoryParam });
  }

  const methodParam = searchParams.get("paymentMethod") || "";
  if (VALID_METHODS.includes(methodParam)) {
    conditions.push({ paymentMethod: methodParam });
  }

  // Date range — append time components to avoid UTC timezone shift (ADR-008 lesson)
  const dueDateFrom = searchParams.get("dueDateFrom") || "";
  if (dueDateFrom) {
    conditions.push({ dueDate: { gte: new Date(dueDateFrom + "T00:00:00") } });
  }

  const dueDateTo = searchParams.get("dueDateTo") || "";
  if (dueDateTo) {
    conditions.push({ dueDate: { lte: new Date(dueDateTo + "T23:59:59") } });
  }

  // Scope every query to the authenticated user — tenant isolation
  conditions.push({ userId: user.id });
  const where = { AND: conditions };

  try {
    const [total, payables] = await Promise.all([
      prisma.payable.count({ where }),
      prisma.payable.findMany({
        where,
        include: {
          supplier: { select: { name: true, document: true, documentType: true } },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const response: PayablesListResponse = {
      payables: payables.map((p) => ({
        id: p.id,
        supplierId: p.supplierId,
        supplierName: p.supplier.name,
        supplierDocument: p.supplier.document,
        supplierDocumentType: p.supplier.documentType as "CNPJ" | "CPF",
        description: p.description,
        category: p.category,
        issueDate: p.issueDate.toISOString(),
        dueDate: p.dueDate.toISOString(),
        amount: p.amount.toString(),
        payValue: p.payValue.toString(),
        paymentMethod: p.paymentMethod,
        invoiceNumber: p.invoiceNumber,
        notes: p.notes,
        tags: p.tags,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[GET /api/payables] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// =============================================================================
// POST /api/payables — Create a new payable
// =============================================================================
// Validates with Zod, parses currency strings to numbers, creates the record.
// Status always starts as PENDING — payment status changes come later.
// =============================================================================

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate the request body against our Zod schema
  const parsed = payableFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Verify the supplier belongs to this user — prevents linking to another user's supplier
  const supplier = await prisma.supplier.findFirst({
    where: { id: data.supplierId, userId: user.id },
  });
  if (!supplier) {
    return NextResponse.json(
      { error: "Fornecedor não encontrado" },
      { status: 404 },
    );
  }

  // Convert currency strings to numbers for Prisma's Decimal type
  const parsedAmount = parseCurrency(data.amount);
  const parsedPayValue = parseCurrency(data.payValue);

  try {
    const payable = await prisma.payable.create({
      data: {
        userId: user.id,
        supplierId: data.supplierId,
        description: data.description,
        category: data.category,
        amount: parsedAmount,
        payValue: parsedPayValue,
        issueDate: new Date(data.issueDate),
        dueDate: new Date(data.dueDate),
        paymentMethod: data.paymentMethod,
        invoiceNumber: data.invoiceNumber || null,
        tags: data.tags,
        notes: data.notes || null,
        status: "PENDING",
      },
      include: { supplier: { select: { name: true } } },
    });

    return NextResponse.json(
      {
        id: payable.id,
        supplierId: payable.supplierId,
        supplierName: payable.supplier.name,
        description: payable.description,
        category: payable.category,
        issueDate: payable.issueDate.toISOString(),
        dueDate: payable.dueDate.toISOString(),
        amount: payable.amount.toString(),
        payValue: payable.payValue.toString(),
        paymentMethod: payable.paymentMethod,
        invoiceNumber: payable.invoiceNumber,
        notes: payable.notes,
        tags: payable.tags,
        status: payable.status,
        createdAt: payable.createdAt.toISOString(),
        updatedAt: payable.updatedAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/payables] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
