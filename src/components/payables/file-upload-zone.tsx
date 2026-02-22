"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  formatFileSize,
} from "@/lib/attachments/types";

// =============================================================================
// FileUploadZone — Drag-and-drop area for selecting files
// =============================================================================
// Uses native HTML5 drag events (onDragOver, onDragLeave, onDrop) plus a
// hidden <input type="file">. No extra dependencies needed.
//
// Client-side validation catches invalid files before they hit the API.
// The blue highlight on drag-over gives visual feedback that the zone is active.
// =============================================================================

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export function FileUploadZone({ onFileSelect, disabled }: FileUploadZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function validateAndSelect(file: File) {
    if (!ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number])) {
      toast.error(`Tipo não permitido: ${file.type || "desconhecido"}. Use ${ALLOWED_EXTENSIONS}.`);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error(`Arquivo muito grande (${formatFileSize(file.size)}). Máximo: ${formatFileSize(MAX_FILE_SIZE)}.`);
      return;
    }

    onFileSelect(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;

    const file = e.dataTransfer.files[0];
    if (file) validateAndSelect(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) validateAndSelect(file);
    // Reset input so the same file can be selected again if needed
    e.target.value = "";
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => !disabled && inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
        dragOver
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-muted-foreground/50",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <Upload className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">
        Arraste arquivos aqui ou clique para selecionar
      </p>
      <p className="text-xs text-muted-foreground">
        {ALLOWED_EXTENSIONS} — máx. {formatFileSize(MAX_FILE_SIZE)}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  );
}
