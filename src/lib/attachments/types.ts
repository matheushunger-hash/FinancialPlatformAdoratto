// Shared types, constants, and helpers for the Attachment feature.
// Used by both the API routes (server) and the UI components (client).

export interface AttachmentItem {
  id: string;
  payableId: string;
  fileName: string;
  fileUrl: string; // Storage path inside the bucket (NOT a public URL)
  fileSize: number; // Bytes
  mimeType: string;
  createdAt: string; // ISO string
}

// Only these MIME types are accepted — matches the Supabase bucket config.
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
] as const;

// 5 MB in bytes — matches the Supabase bucket file size limit.
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Human-readable labels for display (e.g., in the upload zone helper text).
export const ALLOWED_EXTENSIONS = "PDF, PNG, JPG";

/**
 * Converts bytes to a human-readable string.
 * Examples: 512 → "512 B", 125_000 → "122 KB", 2_400_000 → "2.3 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
