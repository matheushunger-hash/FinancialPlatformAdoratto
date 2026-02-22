"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PayableForm } from "@/components/payables/payable-form";
import { AttachmentSection } from "@/components/payables/attachment-section";
import type { PayableDetail } from "@/lib/payables/types";

// =============================================================================
// PayableSheet — Slides in from the right for creating or editing a payable
// =============================================================================
// Two modes controlled by the `payableId` prop:
//   - null → create mode (empty form, no fetch, no attachment section)
//   - string → edit mode (fetches detail from API, shows form + attachments)
//
// Uses `key={payable?.id ?? "new"}` on PayableForm to force React to unmount
// and remount the form when switching between different payables. This is
// necessary because react-hook-form's defaultValues only apply on mount.
//
// The attachment section lives OUTSIDE the form because attachments are
// independent CRUD operations, not form state. It calls fetchPayable to
// refresh the data after upload/delete.
// =============================================================================

interface PayableSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  payableId: string | null; // null = create, string = edit
}

export function PayableSheet({
  open,
  onOpenChange,
  onSuccess,
  payableId,
}: PayableSheetProps) {
  const [payable, setPayable] = useState<PayableDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = payableId !== null;

  // Extracted to useCallback so it can be called both by the useEffect
  // (initial load) and by AttachmentSection (refresh after upload/delete).
  const fetchPayable = useCallback(async () => {
    if (!payableId) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payables/${payableId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao carregar título");
      }
      const data: PayableDetail = await res.json();
      setPayable(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao carregar título",
      );
    } finally {
      setLoading(false);
    }
  }, [payableId]);

  // Fetch payable detail when opening in edit mode
  useEffect(() => {
    if (!open || !payableId) {
      // Reset state when closing or in create mode
      setPayable(null);
      setError(null);
      return;
    }

    fetchPayable();
  }, [open, payableId, fetchPayable]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Editar Título a Pagar" : "Novo Título a Pagar"}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Altere os dados do título abaixo."
              : "Preencha os dados do título abaixo."}
          </SheetDescription>
        </SheetHeader>

        {/* Loading spinner while fetching payable detail */}
        {isEditing && loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error message if fetch failed */}
        {isEditing && error && (
          <div className="px-4 py-8 text-center text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Render form: immediately for create, after data loads for edit */}
        {(!isEditing || (isEditing && payable && !loading)) && (
          <>
            <PayableForm
              key={payable?.id ?? "new"}
              payable={payable}
              onSuccess={onSuccess}
            />

            {/* Attachment section — only visible in edit mode (needs payableId) */}
            {isEditing && payable && (
              <AttachmentSection
                payableId={payable.id}
                attachments={payable.attachments}
                onAttachmentsChange={fetchPayable}
              />
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
