import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
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

    const [total, batches] = await Promise.all([
      prisma.importBatch.count({ where: { tenantId: ctx.tenantId } }),
      prisma.importBatch.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { importedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, name: true } },
        },
      }),
    ]);

    const data = batches.map((b) => ({
      id: b.id,
      filename: b.filename,
      totalRows: b.totalRows,
      acceptedRows: b.acceptedRows,
      rejectedRows: b.rejectedRows,
      grossTotal: b.grossTotal.toString(),
      netTotal: b.netTotal.toString(),
      dateFrom: b.dateFrom.toISOString().split("T")[0],
      dateTo: b.dateTo.toISOString().split("T")[0],
      importedAt: b.importedAt.toISOString(),
      importedBy: { id: b.user.id, name: b.user.name },
    }));

    return NextResponse.json({
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    console.error("[GET /api/ar/import/batches] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
