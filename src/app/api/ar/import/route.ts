import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { parseImportFile } from "@/lib/ar/importParser";
import { persistBatch } from "@/lib/ar/importService";
import { DuplicateBatchError } from "@/lib/ar/errors";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Extract file from multipart FormData
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Arquivo não enviado" },
        { status: 400 },
      );
    }

    const filename = file.name;
    if (!filename.endsWith(".xlsx") && !filename.endsWith(".xls")) {
      return NextResponse.json(
        { error: "Formato inválido. Envie um arquivo .xlsx ou .xls" },
        { status: 400 },
      );
    }

    // Parse the XLSX file
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseImportFile(buffer);

    if (parsed.accepted.length === 0 && parsed.rejected.length === 0) {
      return NextResponse.json(
        { error: "Arquivo vazio ou formato inválido" },
        { status: 400 },
      );
    }

    // Persist to database
    try {
      const result = await persistBatch(
        parsed,
        ctx.userId,
        ctx.tenantId,
        filename,
      );

      return NextResponse.json(
        {
          data: {
            batchId: result.batchId,
            totalRows: result.acceptedRows + result.rejectedRows,
            acceptedRows: result.acceptedRows,
            rejectedRows: result.rejectedRows,
            grossTotal: parsed.meta.grossTotal.toString(),
            netTotal: parsed.meta.netTotal.toString(),
            dateFrom: parsed.meta.dateFrom,
            dateTo: parsed.meta.dateTo,
            rejectedItems: result.rejected,
          },
        },
        { status: 201 },
      );
    } catch (err) {
      if (err instanceof DuplicateBatchError) {
        return NextResponse.json(
          {
            error: {
              code: "DUPLICATE_BATCH",
              message: err.message,
              existingBatchId: err.existingBatchId,
            },
          },
          { status: 409 },
        );
      }
      throw err;
    }
  } catch (err) {
    console.error("[POST /api/ar/import] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
