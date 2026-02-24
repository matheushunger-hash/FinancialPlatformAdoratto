import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { formatCNPJ, formatCPF } from "@/lib/suppliers/validation";

// =============================================================================
// GET /api/export — Server-side CSV export for all filtered payables (ADR-019)
// =============================================================================
// Same filter logic as GET /api/payables, but fetches ALL matching rows (no
// pagination) and returns a downloadable CSV file. Used by the "Exportar"
// toolbar button to export the full filtered dataset across all pages.
// =============================================================================

// --- Whitelist constants (same as GET /api/payables) ---

const VALID_STATUSES = ["PENDING", "APPROVED", "REJECTED", "PAID", "OVERDUE", "CANCELLED"];
const VALID_CATEGORIES = ["REVENDA", "DESPESA"];
const VALID_METHODS = [
  "BOLETO",
  "PIX",
  "TRANSFERENCIA",
  "CARTAO",
  "DINHEIRO",
  "CHEQUE",
];

type PrismaOrder = Record<string, unknown>;
const SORT_MAP: Record<string, (order: "asc" | "desc") => PrismaOrder> = {
  supplierName: (order) => ({ supplier: { name: order } }),
  dueDate: (order) => ({ dueDate: order }),
  amount: (order) => ({ amount: order }),
  payValue: (order) => ({ payValue: order }),
  status: (order) => ({ status: order }),
};

// --- CSV formatting helpers (same output as client-side export-csv.ts) ---

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
  PAID: "Pago",
  OVERDUE: "Vencido",
  CANCELLED: "Cancelado",
};

const TAG_LABELS: Record<string, string> = {
  protestado: "Protestado",
  segurado: "Segurado",
  renegociado: "Renegociado",
  negativar: "Negativar",
  duplicado: "Duplicado",
  "sem-boleto": "Sem Boleto",
  "sem-faturamento": "Sem Faturamento",
};

const METHOD_LABELS: Record<string, string> = {
  BOLETO: "Boleto",
  PIX: "PIX",
  TRANSFERENCIA: "Transferência",
  CARTAO: "Cartão",
  DINHEIRO: "Dinheiro",
  CHEQUE: "Cheque",
};

function escapeCSV(value: string): string {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// .split("T")[0] before T12:00:00 — date safety rule from CLAUDE.md
function formatDateBR(isoDate: string): string {
  const dateOnly = isoDate.split("T")[0];
  const d = new Date(dateOnly + "T12:00:00");
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatBRNumber(value: string): string {
  const num = Number(value);
  if (isNaN(num)) return value;
  return num.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Safety limit — prevent memory issues on very large datasets
const MAX_EXPORT_ROWS = 5000;

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  // Sorting — same logic as GET /api/payables
  const sortParam = searchParams.get("sort") || "dueDate";
  const orderParam =
    searchParams.get("order") === "asc" ? "asc" : ("desc" as const);
  const buildOrderBy = SORT_MAP[sortParam] ?? SORT_MAP.dueDate;
  const orderBy = buildOrderBy(orderParam);

  // Build conditions[] + AND (same pattern as GET /api/payables)
  const conditions: Record<string, unknown>[] = [];

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
    const payables = await prisma.payable.findMany({
      where,
      include: {
        supplier: { select: { name: true, document: true, documentType: true } },
      },
      orderBy,
      take: MAX_EXPORT_ROWS,
    });

    // --- Build CSV ---

    const headers = [
      "Fornecedor",
      "CNPJ/CPF",
      "Descrição",
      "Categoria",
      "Vencimento",
      "Data Rastreamento",
      "Valor Original",
      "Valor a Pagar",
      "Status",
      "Tags",
      "Forma de Pagamento",
      "Nota Fiscal",
    ];

    const rows = payables.map((p) => [
      escapeCSV(p.supplier?.name ?? p.payee ?? ""),
      escapeCSV(
        p.supplier
          ? (p.supplier.documentType === "CNPJ"
              ? formatCNPJ(p.supplier.document)
              : formatCPF(p.supplier.document))
          : "",
      ),
      escapeCSV(p.description),
      escapeCSV(p.category === "REVENDA" ? "Revenda" : "Despesa"),
      formatDateBR(p.dueDate.toISOString()),
      p.overdueTrackedAt ? formatDateBR(p.overdueTrackedAt.toISOString()) : "",
      formatBRNumber(p.amount.toString()),
      formatBRNumber(p.payValue.toString()),
      STATUS_LABELS[p.status.toUpperCase()] ?? p.status,
      escapeCSV(
        p.tags.map((t: string) => TAG_LABELS[t] ?? t).join(", "),
      ),
      METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod,
      escapeCSV(p.invoiceNumber ?? ""),
    ]);

    const BOM = "\uFEFF";
    const csv =
      BOM +
      headers.join(";") +
      "\n" +
      rows.map((row) => row.join(";")).join("\n");

    // Filename: titulos-YYYY-MM-DD.csv
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="titulos-${yyyy}-${mm}-${dd}.csv"`,
      },
    });
  } catch (err) {
    console.error("[GET /api/export] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
