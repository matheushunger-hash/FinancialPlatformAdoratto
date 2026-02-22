import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// =============================================================================
// GET /api/attachments/[id] — Generate a signed URL for downloading
// =============================================================================
// Returns a temporary signed URL (1 hour) instead of exposing the raw storage
// path. This way, the bucket stays private and every download is authenticated.
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
    // Fetch the attachment record
    const attachment = await prisma.attachment.findUnique({ where: { id } });

    if (!attachment) {
      return NextResponse.json(
        { error: "Anexo não encontrado" },
        { status: 404 },
      );
    }

    // Verify tenant ownership through the parent payable
    const payable = await prisma.payable.findFirst({
      where: { id: attachment.payableId, tenantId: ctx.tenantId },
    });

    if (!payable) {
      return NextResponse.json(
        { error: "Anexo não encontrado" },
        { status: 404 },
      );
    }

    // Generate a signed URL valid for 1 hour (3600 seconds)
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from("attachments")
      .createSignedUrl(attachment.fileUrl, 3600);

    if (error || !data?.signedUrl) {
      console.error("[GET /api/attachments/[id]] Signed URL error:", error);
      return NextResponse.json(
        { error: "Erro ao gerar link de download" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (err) {
    console.error("[GET /api/attachments/[id]] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// =============================================================================
// DELETE /api/attachments/[id] — Remove an attachment from Storage and DB
// =============================================================================
// Deletes from Storage FIRST, then from the database. This order is safer:
// if the DB delete succeeds but storage fails, we'd have an orphaned file
// with no database reference to find it. Reverse order prevents that.
// =============================================================================

export async function DELETE(
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
    // Fetch the attachment record
    const attachment = await prisma.attachment.findUnique({ where: { id } });

    if (!attachment) {
      return NextResponse.json(
        { error: "Anexo não encontrado" },
        { status: 404 },
      );
    }

    // Verify tenant ownership through the parent payable
    const payable = await prisma.payable.findFirst({
      where: { id: attachment.payableId, tenantId: ctx.tenantId },
    });

    if (!payable) {
      return NextResponse.json(
        { error: "Anexo não encontrado" },
        { status: 404 },
      );
    }

    // Step 1: Delete from Storage first (safer order — see comment above)
    const supabase = await createClient();
    const { error: storageError } = await supabase.storage
      .from("attachments")
      .remove([attachment.fileUrl]);

    if (storageError) {
      console.error("[DELETE /api/attachments/[id]] Storage error:", storageError);
      return NextResponse.json(
        { error: "Erro ao remover arquivo do storage" },
        { status: 500 },
      );
    }

    // Step 2: Delete the database record
    await prisma.attachment.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/attachments/[id]] error:", err);
    const message =
      err instanceof Error ? err.message : "Erro interno do servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
