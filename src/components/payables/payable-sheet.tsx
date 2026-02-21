"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PayableForm } from "@/components/payables/payable-form";

// =============================================================================
// PayableSheet — Slides in from the right for creating a new payable
// =============================================================================
// Same thin-wrapper pattern as SupplierSheet. Controls the Sheet open/close
// and delegates the actual form to PayableForm.
// =============================================================================

interface PayableSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function PayableSheet({
  open,
  onOpenChange,
  onSuccess,
}: PayableSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Novo Título a Pagar</SheetTitle>
          <SheetDescription>
            Preencha os dados do título abaixo.
          </SheetDescription>
        </SheetHeader>
        <PayableForm onSuccess={onSuccess} />
      </SheetContent>
    </Sheet>
  );
}
