import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { payableFormSchema, parseCurrency } from "@/lib/payables/validation";
import { computeDisplayStatus, buildWhereFromDisplayStatus } from "@/lib/payables/status";
import type { DisplayStatus } from "@/lib/payables/status";
import type { PayablesListResponse } from "@/lib/payables/types";

// =============================================================================
// GET /api/payables — List payables with pagination, sorting, and search
// =============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Whitelist of sortable columns → Prisma orderBy mapping
type PrismaOrder = Record<string, unknown>;
const SORT_MAP: Record<string, (order: "asc" | "desc") => PrismaOrder> = {
  supplierName: (order) => ({ supplier: { name: order } }),
  dueDate: (order) => ({ dueDate: order }),
  scheduledDate: (order) => ({ scheduledDate: order }),
  amount: (order) => ({ amount: order }),
  payValue: (order) => ({ payValue: order }),
  jurosMulta: (order) => ({ jurosMulta: order }),
  actionStatus: (order) => ({ actionStatus: order }),
  // daysOverdue maps to dueDate with reversed direction
  daysOverdue: (order) => ({ dueDate: order === "asc" ? "desc" : "asc" }),
};

// Whitelist of valid display statuses
const VALID_DISPLAY_STATUSES = new Set<DisplayStatus>([
  "A_VENCER", "VENCE_HOJE", "VENCIDO", "APROVADO", "SEGURADO", "PAGO", "PROTESTADO", "CANCELADO",
]);
const VALID_CATEGORIES = ["REVENDA", "DESPESA"];
const VALID_METHODS = [
  "BOLETO", "PIX", "TRANSFERENCIA", "CARTAO", "DINHEIRO", "CHEQUE", "TAX_SLIP", "PAYROLL",
];

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
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

  // Build combined WHERE clause
  const conditions: Record<string, unknown>[] = [];

  // Search
  const searchTerm = searchParams.get("search")?.trim() || "";
  if (searchTerm) {
    conditions.push({
      OR: [
        { description: { contains: searchTerm, mode: "insensitive" } },
        { supplier: { name: { contains: searchTerm, mode: "insensitive" } } },
        { payee: { contains: searchTerm, mode: "insensitive" } },
        { invoiceNumber: { contains: searchTerm, mode: "insensitive" } },
        { notes: { contains: searchTerm, mode: "insensitive" } },
        { supplier: { document: { contains: searchTerm, mode: "insensitive" } } },
      ],
    });
  }

  // Display status filter — replaces old status + overdue filters
  const displayStatusParam = searchParams.get("displayStatus") || "";
  const displayStatuses = displayStatusParam
    .split(",")
    .filter((s): s is DisplayStatus => VALID_DISPLAY_STATUSES.has(s as DisplayStatus));

  if (displayStatuses.length > 0) {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const statusWhere = buildWhereFromDisplayStatus(displayStatuses, todayStr);
    if (Object.keys(statusWhere).length > 0) {
      conditions.push(statusWhere);
    }
  }

  // Category filter
  const categoryParam = searchParams.get("category") || "";
  if (VALID_CATEGORIES.includes(categoryParam)) {
    conditions.push({ category: categoryParam });
  }

  // Payment method filter
  const methodParam = searchParams.get("paymentMethod") || "";
  if (VALID_METHODS.includes(methodParam)) {
    conditions.push({ paymentMethod: methodParam });
  }

  // Supplier filter
  const supplierIdParam = searchParams.get("supplierId") || "";
  if (supplierIdParam && UUID_REGEX.test(supplierIdParam)) {
    conditions.push({ supplierId: supplierIdParam });
  }

  // Date range
  const dueDateFrom = searchParams.get("dueDateFrom") || "";
  if (dueDateFrom) {
    conditions.push({ dueDate: { gte: new Date(dueDateFrom + "T00:00:00.000Z") } });
  }

  const dueDateTo = searchParams.get("dueDateTo") || "";
  if (dueDateTo) {
    conditions.push({ dueDate: { lte: new Date(dueDateTo + "T23:59:59.999Z") } });
  }

  // Tenant isolation
  conditions.push({ tenantId: ctx.tenantId });
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

    // Compute "today" once for daysOverdue calculation
    const todayForAging = new Date();
    todayForAging.setHours(0, 0, 0, 0);
    const todayMs = todayForAging.getTime();

    const response: PayablesListResponse = {
      payables: payables.map((p) => {
        const ds = computeDisplayStatus(p.actionStatus, p.dueDate);
        const isOverdue = p.actionStatus === null && p.dueDate.getTime() < todayMs;

        return {
          id: p.id,
          supplierId: p.supplierId,
          supplierName: p.supplier?.name ?? null,
          supplierDocument: p.supplier?.document ?? null,
          supplierDocumentType: (p.supplier?.documentType as "CNPJ" | "CPF") ?? null,
          payee: p.payee ?? null,
          description: p.description,
          category: p.category,
          issueDate: p.issueDate.toISOString(),
          dueDate: p.dueDate.toISOString(),
          scheduledDate: p.scheduledDate?.toISOString() ?? null,
          amount: p.amount.toString(),
          payValue: p.payValue.toString(),
          jurosMulta: p.jurosMulta?.toString() ?? "0",
          daysOverdue: isOverdue
            ? Math.floor((todayMs - p.dueDate.getTime()) / 86_400_000)
            : null,
          paymentMethod: p.paymentMethod,
          invoiceNumber: p.invoiceNumber,
          notes: p.notes,
          tags: p.tags,
          actionStatus: p.actionStatus,
          displayStatus: ds,
          source: p.source,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        };
      }),
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

  const parsed = payableFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Verify the supplier belongs to this tenant
  if (data.supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: data.supplierId, tenantId: ctx.tenantId },
    });
    if (!supplier) {
      return NextResponse.json(
        { error: "Fornecedor não encontrado" },
        { status: 404 },
      );
    }
  }

  const parsedAmount = parseCurrency(data.amount);
  const parsedPayValue = parseCurrency(data.payValue);
  const jurosMulta = parsedPayValue > parsedAmount ? parsedPayValue - parsedAmount : 0;

  const dueDateValue = new Date(data.dueDate + "T12:00:00");

  try {
    const payable = await prisma.payable.create({
      data: {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        supplierId: data.supplierId || null,
        payee: data.payee?.trim() || null,
        description: data.description,
        category: data.category,
        amount: parsedAmount,
        payValue: parsedPayValue,
        jurosMulta,
        issueDate: new Date(data.issueDate + "T12:00:00"),
        dueDate: dueDateValue,
        scheduledDate: data.scheduledDate
          ? new Date(data.scheduledDate + "T12:00:00")
          : dueDateValue,
        paymentMethod: data.paymentMethod,
        invoiceNumber: data.invoiceNumber || null,
        tags: data.tags,
        notes: data.notes || null,
        actionStatus: null, // No action taken — temporal status kicks in
        source: "MANUAL",
      },
      include: { supplier: { select: { name: true } } },
    });

    const ds = computeDisplayStatus(payable.actionStatus, payable.dueDate);

    return NextResponse.json(
      {
        id: payable.id,
        supplierId: payable.supplierId,
        supplierName: payable.supplier?.name ?? null,
        payee: payable.payee ?? null,
        description: payable.description,
        category: payable.category,
        issueDate: payable.issueDate.toISOString(),
        dueDate: payable.dueDate.toISOString(),
        scheduledDate: payable.scheduledDate?.toISOString() ?? null,
        amount: payable.amount.toString(),
        payValue: payable.payValue.toString(),
        jurosMulta: payable.jurosMulta?.toString() ?? "0",
        paymentMethod: payable.paymentMethod,
        invoiceNumber: payable.invoiceNumber,
        notes: payable.notes,
        tags: payable.tags,
        actionStatus: payable.actionStatus,
        displayStatus: ds,
        source: payable.source,
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
