"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FileUploadZone } from "@/components/payables/file-upload-zone";
import { AttachmentList } from "@/components/payables/attachment-list";
import type { AttachmentItem } from "@/lib/attachments/types";

// =============================================================================
// AttachmentSection — Orchestrator for file upload + list management
// =============================================================================
// Combines FileUploadZone (input) and AttachmentList (display) into a single
// section. Manages all async state: uploading, downloading, deleting.
//
// Lives OUTSIDE the PayableForm because attachments are independent CRUD
// operations — they're not part of the form's submit flow.
// =============================================================================

interface AttachmentSectionProps {
  payableId: string;
  attachments: AttachmentItem[];
  onAttachmentsChange: () => void; // Called after upload/delete to refresh data
}

export function AttachmentSection({
  payableId,
  attachments,
  onAttachmentsChange,
}: AttachmentSectionProps) {
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("payableId", payableId);
      formData.append("file", file);

      // Important: do NOT set Content-Type header manually — the browser
      // sets it automatically for FormData with the correct multipart boundary.
      const res = await fetch("/api/attachments", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao fazer upload");
      }

      toast.success(`"${file.name}" anexado com sucesso`);
      onAttachmentsChange(); // Refresh the payable detail to get updated list
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao fazer upload",
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(id: string) {
    setDownloadingId(id);
    try {
      const res = await fetch(`/api/attachments/${id}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao gerar link de download");
      }

      const { url } = await res.json();
      window.open(url, "_blank");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao baixar arquivo",
      );
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao excluir anexo");
      }

      toast.success("Anexo excluído com sucesso");
      onAttachmentsChange(); // Refresh the payable detail to get updated list
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao excluir anexo",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <fieldset className="space-y-3 px-4 pb-4">
      <legend className="text-sm font-medium">Anexos</legend>

      <AttachmentList
        attachments={attachments}
        onDownload={handleDownload}
        onDelete={handleDelete}
        downloadingId={downloadingId}
        deletingId={deletingId}
      />

      {/* Upload zone — disabled while an upload is in progress */}
      <div className="relative">
        <FileUploadZone onFileSelect={handleUpload} disabled={uploading} />
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/80">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </fieldset>
  );
}
