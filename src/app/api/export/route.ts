import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { formatCNPJ, formatCPF } from "@/lib/suppliers/validation";
import { computeDisplayStatus, DISPLAY_STATUS_CONFIG, buildWhereFromDisplayStatus } from "@/lib/payables/status";
import type { DisplayStatus } from "@/lib/payables/status";

// =============================================================================
// GET /api/export — Server-side CSV export for all filtered payables (ADR-019)
// =============================================================================

const VALID_DISPLAY_STATUSES = new Set<DisplayStatus>([
  "A_VENCER", "VENCE_HOJE", "VENCIDO", "APROVADO", "SEGURADO", "PAGO", "PROTESTADO", "CANCELADO",
]);
const VALID_CATEGORIES = ["REVENDA", "DESPESA"];
const VALID_METHODS = [
  "BOLETO", "PIX", "TRANSFERENCIA", "CARTAO", "DINHEIRO", "CHEQUE", "TAX_SLIP", "PAYROLL",
];

type PrismaOrder = Record<string, unknown>;
const SORT_MAP: Record<string, (order: "asc" | "desc") => PrismaOrder> = {
  supplierName: (order) => ({ supplier: { name: order } }),
  dueDate: (order) => ({ dueDate: order }),
  amount: (order) => ({ amount: order }),
  payValue: (order) => ({ payValue: order }),
  actionStatus: (order) => ({ actionStatus: order }),
};

const TAG_LABELS: Record<string, string> = {
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
  TAX_SLIP: "Guia (DAS/DARF)",
  PAYROLL: "Folha de Pagamento",
};

const SOURCE_LABELS: Record<string, string> = {
  IMPORT: "Importação",
  MANUAL: "Manual",
  BANK_API: "API Bancária",
};

function escapeCSV(value: string): string {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

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

const MAX_EXPORT_ROWS = 5000;

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  const sortParam = searchParams.get("sort") || "dueDate";
  const orderParam =
    searchParams.get("order") === "asc" ? "asc" : ("desc" as const);
  const buildOrderBy = SORT_MAP[sortParam] ?? SORT_MAP.dueDate;
  const orderBy = buildOrderBy(orderParam);

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

  // Display status filter
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

    const headers = [
      "Fornecedor",
      "CNPJ/CPF",
      "Descrição",
      "Categoria",
      "Vencimento",
      "Data Programada",
      "Valor Original",
      "Valor a Pagar",
      "Status",
      "Origem",
      "Tags",
      "Forma de Pagamento",
      "Nota Fiscal",
    ];

    const rows = payables.map((p) => {
      const ds = computeDisplayStatus(p.actionStatus, p.dueDate);
      return [
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
        p.scheduledDate ? formatDateBR(p.scheduledDate.toISOString()) : "",
        formatBRNumber(p.amount.toString()),
        formatBRNumber(p.payValue.toString()),
        DISPLAY_STATUS_CONFIG[ds]?.label ?? ds,
        SOURCE_LABELS[p.source] ?? p.source,
        escapeCSV(
          p.tags.map((t: string) => TAG_LABELS[t] ?? t).join(", "),
        ),
        METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod,
        escapeCSV(p.invoiceNumber ?? ""),
      ];
    });

    const BOM = "\uFEFF";
    const csv =
      BOM +
      headers.join(";") +
      "\n" +
      rows.map((row) => row.join(";")).join("\n");

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
