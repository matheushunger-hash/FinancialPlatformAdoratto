import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { recurringFormSchema } from "@/lib/recurring/validation";
import { parseCurrency } from "@/lib/payables/validation";
import type { RecurringListResponse } from "@/lib/recurring/types";

// =============================================================================
// GET /api/recurring — List recurring payable templates
// =============================================================================

type PrismaOrder = Record<string, unknown>;
const SORT_MAP: Record<string, (order: "asc" | "desc") => PrismaOrder> = {
  supplierName: (order) => ({ supplier: { name: order } }),
  description: (order) => ({ description: order }),
  amount: (order) => ({ amount: order }),
  frequency: (order) => ({ frequency: order }),
  startDate: (order) => ({ startDate: order }),
  active: (order) => ({ active: order }),
  createdAt: (order) => ({ createdAt: order }),
};

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(
    50,
    Math.max(1, Number(searchParams.get("pageSize")) || 20),
  );

  // Sorting — default to createdAt desc
  const sortParam = searchParams.get("sort") || "createdAt";
  const orderParam =
    searchParams.get("order") === "asc" ? "asc" : ("desc" as const);
  const buildOrderBy = SORT_MAP[sortParam] ?? SORT_MAP.createdAt;
  const orderBy = buildOrderBy(orderParam);

  // Build combined WHERE clause
  const conditions: Record<string, unknown>[] = [];

  // Search across description + supplier name
  const searchTerm = searchParams.get("search")?.trim() || "";
  if (searchTerm) {
    conditions.push({
      OR: [
        { description: { contains: searchTerm, mode: "insensitive" } },
        { supplier: { name: { contains: searchTerm, mode: "insensitive" } } },
      ],
    });
  }

  // Active filter
  const activeParam = searchParams.get("active");
  if (activeParam === "true") {
    conditions.push({ active: true });
  } else if (activeParam === "false") {
    conditions.push({ active: false });
  }

  // Frequency filter
  const frequencyParam = searchParams.get("frequency") || "";
  if (["WEEKLY", "MONTHLY", "YEARLY"].includes(frequencyParam)) {
    conditions.push({ frequency: frequencyParam });
  }

  // Scope to tenant
  conditions.push({ tenantId: ctx.tenantId });
  const where = { AND: conditions };

  try {
    const [total, items] = await Promise.all([
      prisma.recurringPayable.count({ where }),
      prisma.recurringPayable.findMany({
        where,
        include: {
          supplier: { select: { name: true } },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const response: RecurringListResponse = {
      items: items.map((r) => ({
        id: r.id,
        supplierId: r.supplierId,
        supplierName: r.supplier.name,
        description: r.description,
        amount: r.amount.toString(),
        category: r.category,
        paymentMethod: r.paymentMethod,
        frequency: r.frequency,
        dayOfMonth: r.dayOfMonth,
        startDate: r.startDate.toISOString(),
        endDate: r.endDate?.toISOString() ?? null,
        active: r.active,
        lastGeneratedAt: r.lastGeneratedAt?.toISOString() ?? null,
        tags: r.tags,
        notes: r.notes,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[GET /api/recurring] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// =============================================================================
// POST /api/recurring — Create a new recurring payable template
// =============================================================================

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = recurringFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Verify supplier belongs to this tenant
  const supplier = await prisma.supplier.findFirst({
    where: { id: data.supplierId, tenantId: ctx.tenantId },
  });
  if (!supplier) {
    return NextResponse.json(
      { error: "Fornecedor não encontrado" },
      { status: 404 },
    );
  }

  const parsedAmount = parseCurrency(data.amount);
  const parsedDay = data.dayOfMonth ? parseInt(data.dayOfMonth, 10) : null;

  try {
    const created = await prisma.recurringPayable.create({
      data: {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        supplierId: data.supplierId,
        description: data.description,
        category: data.category,
        amount: parsedAmount,
        paymentMethod: data.paymentMethod,
        frequency: data.frequency,
        dayOfMonth: data.frequency === "MONTHLY" ? parsedDay : null,
        startDate: new Date(data.startDate + "T12:00:00"),
        endDate: data.endDate ? new Date(data.endDate + "T12:00:00") : null,
        tags: data.tags,
        notes: data.notes || null,
      },
      include: { supplier: { select: { name: true } } },
    });

    return NextResponse.json(
      {
        id: created.id,
        supplierId: created.supplierId,
        supplierName: created.supplier.name,
        description: created.description,
        amount: created.amount.toString(),
        category: created.category,
        paymentMethod: created.paymentMethod,
        frequency: created.frequency,
        dayOfMonth: created.dayOfMonth,
        startDate: created.startDate.toISOString(),
        endDate: created.endDate?.toISOString() ?? null,
        active: created.active,
        lastGeneratedAt: created.lastGeneratedAt?.toISOString() ?? null,
        tags: created.tags,
        notes: created.notes,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/recurring] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
