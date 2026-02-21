"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PayableSheet } from "@/components/payables/payable-sheet";

// =============================================================================
// PayablesView — The orchestrator component for contas a pagar
// =============================================================================
// Same pattern as SuppliersView — owns all the state, passes data/callbacks
// down to child components. For now (ADR-007) it's minimal: just a "Novo
// Título" button and the sheet. ADR-008 will extend this with a table,
// pagination, search, and filters — no rewrite needed.
// =============================================================================

export function PayablesView() {
  const [sheetOpen, setSheetOpen] = useState(false);

  function handleNew() {
    setSheetOpen(true);
  }

  function handleSuccess() {
    setSheetOpen(false);
    // ADR-008 will add fetchPayables() here to refresh the table
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Use o botão para cadastrar um novo título a pagar.
        </p>
        <Button onClick={handleNew}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Título
        </Button>
      </div>

      {/* Empty state placeholder — ADR-008 will replace this with a table */}
      <div className="flex items-center justify-center rounded-md border border-dashed p-12">
        <p className="text-sm text-muted-foreground">
          A tabela de títulos será implementada no próximo ADR.
        </p>
      </div>

      {/* Side sheet (create form) */}
      <PayableSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
