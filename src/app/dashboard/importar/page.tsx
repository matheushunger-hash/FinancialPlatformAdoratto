import { ImportView } from "@/components/import/import-view";

// =============================================================================
// /dashboard/importar — Spreadsheet Import Page (ADR-018)
// =============================================================================
// Server Component wrapper that renders the client-side import wizard.
// The wizard handles all interactive state (file parsing, mapping, API calls).
// =============================================================================

export default function ImportarPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar Planilha</h1>
        <p className="text-muted-foreground">
          Importe títulos a pagar a partir de uma planilha Excel ou CSV.
        </p>
      </div>

      <ImportView />
    </div>
  );
}
