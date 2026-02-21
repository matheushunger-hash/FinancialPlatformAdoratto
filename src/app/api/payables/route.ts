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

  // Search — filter across description, supplier name, and invoice number
  const searchTerm = searchParams.get("search")?.trim() || "";
  const where = searchTerm
    ? {
        OR: [
          { description: { contains: searchTerm, mode: "insensitive" as const } },
          { supplier: { name: { contains: searchTerm, mode: "insensitive" as const } } },
          { invoiceNumber: { contains: searchTerm, mode: "insensitive" as const } },
        ],
      }
    : {};

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
