"use client";

import { Download, FileText, ImageIcon, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/attachments/types";
import type { AttachmentItem } from "@/lib/attachments/types";

// =============================================================================
// AttachmentList — Displays attached files with download/delete actions
// =============================================================================
// Each row: [FileIcon] filename.pdf    125 KB    [Download] [Delete]
//
// "Dumb" component — receives data and callbacks from the parent orchestrator.
// The delete button opens an AlertDialog confirmation before actually deleting.
// Loading spinners appear on the specific item being downloaded or deleted.
// =============================================================================

interface AttachmentListProps {
  attachments: AttachmentItem[];
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
  downloadingId: string | null;
  deletingId: string | null;
}

function getFileIcon(mimeType: string) {
  if (mimeType === "application/pdf") return FileText;
  return ImageIcon; // PNG or JPG
}

export function AttachmentList({
  attachments,
  onDownload,
  onDelete,
  downloadingId,
  deletingId,
}: AttachmentListProps) {
  if (attachments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nenhum anexo.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {attachments.map((attachment) => {
        const Icon = getFileIcon(attachment.mimeType);
        const isDownloading = downloadingId === attachment.id;
        const isDeleting = deletingId === attachment.id;

        return (
          <li
            key={attachment.id}
            className="flex items-center gap-3 rounded-md border px-3 py-2"
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />

            {/* File name — truncate if too long */}
            <span className="min-w-0 flex-1 truncate text-sm">
              {attachment.fileName}
            </span>

            {/* File size */}
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatFileSize(attachment.fileSize)}
            </span>

            {/* Download button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => onDownload(attachment.id)}
              disabled={isDownloading || isDeleting}
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span className="sr-only">Download</span>
            </Button>

            {/* Delete button with confirmation dialog */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                  disabled={isDownloading || isDeleting}
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  <span className="sr-only">Excluir</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir anexo</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja excluir &ldquo;{attachment.fileName}
                    &rdquo;? Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(attachment.id)}>
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </li>
        );
      })}
    </ul>
  );
}
