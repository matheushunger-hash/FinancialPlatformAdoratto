"use client";

import { CheckCircle, CreditCard, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PayableListItem } from "@/lib/payables/types";

// =============================================================================
// BatchActionBar — Floating bar for batch actions on selected payables (ADR-011)
// =============================================================================
// Appears at the bottom of the screen when at least one row is selected.
// Shows: selection count + total R$ value, and action buttons based on role.
//
// "Select all, filter at action time" — selecting a mix of statuses is OK.
// Buttons are disabled when no eligible items exist for that specific action.
// =============================================================================

interface BatchActionBarProps {
  selectedCount: number;
  selectedTotal: number;
  selectedPayables: PayableListItem[];
  userRole: string;
  onApprove: () => void;
  onPay: () => void;
  onExport: () => void;
  onClear: () => void;
}

export function BatchActionBar({
  selectedCount,
  selectedTotal,
  selectedPayables,
  userRole,
  onApprove,
  onPay,
  onExport,
  onClear,
}: BatchActionBarProps) {
  if (selectedCount === 0) return null;

  // Count eligible items for each action
  const pendingCount = selectedPayables.filter(
    (p) => p.status === "PENDING",
  ).length;
  const payableCount = selectedPayables.filter(
    (p) => p.status === "PENDING" || p.status === "APPROVED",
  ).length;

  // Format total as BRL
  const formattedTotal = selectedTotal.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="bg-background fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border px-4 py-3 shadow-lg">
      {/* Selection info */}
      <span className="text-sm font-medium whitespace-nowrap">
        {selectedCount} selecionado{selectedCount !== 1 ? "s" : ""} — R${" "}
        {formattedTotal}
      </span>

      {/* Divider */}
      <div className="bg-border h-6 w-px" />

      {/* Actions */}
      {userRole === "ADMIN" && (
        <Button
          size="sm"
          variant="outline"
          onClick={onApprove}
          disabled={pendingCount === 0}
        >
          <CheckCircle className="mr-2 h-4 w-4" />
          Aprovar ({pendingCount})
        </Button>
      )}

      <Button
        size="sm"
        variant="outline"
        onClick={onPay}
        disabled={payableCount === 0}
      >
        <CreditCard className="mr-2 h-4 w-4" />
        Marcar Pago ({payableCount})
      </Button>

      <Button size="sm" variant="outline" onClick={onExport}>
        <Download className="mr-2 h-4 w-4" />
        Exportar CSV
      </Button>

      {/* Clear selection */}
      <Button
        size="icon"
        variant="ghost"
        onClick={onClear}
        className="h-8 w-8"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Limpar seleção</span>
      </Button>
    </div>
  );
}
