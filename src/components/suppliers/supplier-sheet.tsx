"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SupplierForm } from "@/components/suppliers/supplier-form";
import type { SupplierListItem } from "@/lib/suppliers/types";

// =============================================================================
// SupplierSheet — Slides in from the right for create/edit
// =============================================================================
// This is a thin wrapper: it controls the Sheet (open/close) and decides
// whether to show "Novo Fornecedor" or "Editar Fornecedor" based on whether
// a supplier was passed in. The actual form lives in SupplierForm.
// =============================================================================

interface SupplierSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: SupplierListItem | null;
  onSuccess: () => void;
}

export function SupplierSheet({
  open,
  onOpenChange,
  supplier,
  onSuccess,
}: SupplierSheetProps) {
  const isEditing = supplier !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Editar Fornecedor" : "Novo Fornecedor"}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Altere os dados do fornecedor abaixo."
              : "Preencha os dados do novo fornecedor."}
          </SheetDescription>
        </SheetHeader>
        <SupplierForm supplier={supplier} onSuccess={onSuccess} />
      </SheetContent>
    </Sheet>
  );
}
