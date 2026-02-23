import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { recurringFormSchema } from "@/lib/recurring/validation";
import { parseCurrency } from "@/lib/payables/validation";
import type { RecurringDetail } from "@/lib/recurring/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// =============================================================================
// Helper — build RecurringDetail from a Prisma result + creator name
// =============================================================================

function toDetail(
  r: {
    id: string;
    supplierId: string;
    supplier: { name: string };
    description: string;
    amount: { toString(): string };
    category: string;
    paymentMethod: string;
    frequency: string;
    dayOfMonth: number | null;
    startDate: Date;
    endDate: Date | null;
    active: boolean;
    lastGeneratedAt: Date | null;
    tags: string[];
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  createdByName: string,
): RecurringDetail {
  return {
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
    createdByName,
  };
}

// =============================================================================
// GET /api/recurring/[id] — Fetch a single recurring template
// =============================================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const recurring = await prisma.recurringPayable.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        supplier: { select: { name: true } },
      },
    });

    if (!recurring) {
      return NextResponse.json(
        { error: "Recorrência não encontrada" },
        { status: 404 },
      );
    }

    const creator = await prisma.user.findUnique({
      where: { id: recurring.userId },
      select: { name: true },
    });

    return NextResponse.json(
      toDetail(recurring, creator?.name ?? "Usuário desconhecido"),
    );
  } catch (err) {
    console.error("[GET /api/recurring/[id]] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// =============================================================================
// PATCH /api/recurring/[id] — Update a recurring template
// =============================================================================
// Updates all form fields except supplierId (can't change supplier after creation).

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const existing = await prisma.recurringPayable.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Recorrência não encontrada" },
        { status: 404 },
      );
    }

    const parsed = recurringFormSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const parsedAmount = parseCurrency(data.amount);
    const parsedDay = data.dayOfMonth ? parseInt(data.dayOfMonth, 10) : null;

    const updated = await prisma.recurringPayable.update({
      where: { id },
      data: {
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
        ...(typeof data.active === "boolean" ? { active: data.active } : {}),
      },
      include: {
        supplier: { select: { name: true } },
      },
    });

    const creator = await prisma.user.findUnique({
      where: { id: updated.userId },
      select: { name: true },
    });

    return NextResponse.json(
      toDetail(updated, creator?.name ?? "Usuário desconhecido"),
    );
  } catch (err) {
    console.error("[PATCH /api/recurring/[id]] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// =============================================================================
// DELETE /api/recurring/[id] — Delete a recurring template (ADMIN only)
// =============================================================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const recurring = await prisma.recurringPayable.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!recurring) {
      return NextResponse.json(
        { error: "Recorrência não encontrada" },
        { status: 404 },
      );
    }

    await prisma.recurringPayable.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/recurring/[id]] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
