import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "@/lib/attachments/types";
import type { AttachmentItem } from "@/lib/attachments/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// =============================================================================
// POST /api/attachments — Upload a file attachment to a payable
// =============================================================================
// Expects multipart FormData with:
//   - payableId (string UUID)
//   - file (File blob)
//
// Flow: auth → validate → verify payable ownership → upload to Storage → save record
// =============================================================================

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Parse FormData ---
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data" },
      { status: 400 },
    );
  }

  const payableId = formData.get("payableId");
  const file = formData.get("file");

  if (!payableId || typeof payableId !== "string") {
    return NextResponse.json(
      { error: "payableId is required" },
      { status: 400 },
    );
  }

  if (!UUID_REGEX.test(payableId)) {
    return NextResponse.json(
      { error: "Invalid payableId format" },
      { status: 400 },
    );
  }

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "file is required" },
      { status: 400 },
    );
  }

  // --- Validate file type and size ---
  if (!ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number])) {
    return NextResponse.json(
      { error: "Tipo de arquivo não permitido. Use PDF, PNG ou JPG." },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "Arquivo excede o limite de 5 MB." },
      { status: 400 },
    );
  }

  try {
    // --- Verify payable exists and belongs to this tenant ---
    const payable = await prisma.payable.findFirst({
      where: { id: payableId, tenantId: ctx.tenantId },
    });

    if (!payable) {
      return NextResponse.json(
        { error: "Título não encontrado" },
        { status: 404 },
      );
    }

    // --- Upload to Supabase Storage ---
    // Path structure: {tenantId}/{payableId}/{timestamp}-{sanitized-filename}
    // This keeps files organized and prevents name collisions.
    const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${ctx.tenantId}/${payableId}/${Date.now()}-${sanitized}`;

    const supabase = await createClient();
    const { error: uploadError } = await supabase.storage
      .from("attachments")
      .upload(storagePath, file, { contentType: file.type });

    if (uploadError) {
      console.error("[POST /api/attachments] Storage upload error:", uploadError);
      return NextResponse.json(
        { error: "Erro ao fazer upload do arquivo" },
        { status: 500 },
      );
    }

    // --- Create Prisma record ---
    const attachment = await prisma.attachment.create({
      data: {
        payableId,
        fileName: file.name,
        fileUrl: storagePath, // Store the path, not a public URL
        fileSize: file.size,
        mimeType: file.type,
      },
    });

    const item: AttachmentItem = {
      id: attachment.id,
      payableId: attachment.payableId,
      fileName: attachment.fileName,
      fileUrl: attachment.fileUrl,
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
      createdAt: attachment.createdAt.toISOString(),
    };

    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    console.error("[POST /api/attachments] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
