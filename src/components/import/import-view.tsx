"use client";

import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type {
  ColumnMapping,
  ImportDefaults,
  ImportResponse,
  RawRow,
  WizardStep,
} from "@/lib/import/types";
import { WIZARD_STEPS } from "@/lib/import/types";
import { autoMapColumns } from "@/lib/import/parsing";
import { StepUpload } from "./step-upload";
import { StepPreview } from "./step-preview";
import { StepMapping } from "./step-mapping";
import { StepProcessing } from "./step-processing";
import { StepResults } from "./step-results";

// =============================================================================
// ImportView — Orchestrator for the 5-step import wizard
// =============================================================================
// Owns all wizard state: current step, parsed data, column mapping, defaults,
// and API results. Each step component is "dumb" — it receives data and
// callbacks from the orchestrator.
//
// Flow: Upload → Preview → Mapping → Processing → Results
// =============================================================================

export function ImportView() {
  // --- Wizard state ---
  const [step, setStep] = useState<WizardStep>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [defaults, setDefaults] = useState<ImportDefaults>({
    category: "DESPESA",
    paymentMethod: "BOLETO",
  });
  const [updateExisting, setUpdateExisting] = useState(false);
  const [results, setResults] = useState<ImportResponse | null>(null);

  // --- Step 1 callback: file parsed ---
  function handleFileParsed(name: string, hdrs: string[], parsedRows: RawRow[]) {
    setFileName(name);
    setHeaders(hdrs);
    setRows(parsedRows);

    // Pre-fill column mapping using smart pattern matching
    setMapping(autoMapColumns(hdrs));

    setStep("preview");
  }

  // --- Step 3 callback: mapping confirmed, start import ---
  async function handleMappingConfirm() {
    setStep("processing");

    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, mapping, defaults, updateExisting }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `Erro ${response.status}`);
      }

      const data: ImportResponse = await response.json();
      setResults(data);
      setStep("results");

      if (data.errors.length === 0) {
        const parts = [`${data.created} importados`];
        if (data.updated > 0) parts.push(`${data.updated} atualizados`);
        toast.success(parts.join(", ") + "!");
      } else {
        const parts = [`${data.created} importados`];
        if (data.updated > 0) parts.push(`${data.updated} atualizados`);
        parts.push(`${data.errors.length} erros`);
        toast.warning(parts.join(", ") + ".");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao processar importação",
      );
      // Go back to mapping so the user can retry
      setStep("mapping");
    }
  }

  // --- Reset: go back to upload step ---
  function handleReset() {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping([]);
    setDefaults({ category: "DESPESA", paymentMethod: "BOLETO" });
    setUpdateExisting(false);
    setResults(null);
  }

  // --- Step indicator ---
  const currentStepIndex = WIZARD_STEPS.findIndex((s) => s.key === step);

  return (
    <div className="space-y-6">
      {/* Step indicator bar */}
      <nav className="flex items-center justify-center gap-2">
        {WIZARD_STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium",
                  i < currentStepIndex
                    ? "bg-primary text-primary-foreground"
                    : i === currentStepIndex
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {i + 1}
              </div>
              <span
                className={cn(
                  "hidden text-sm sm:inline",
                  i === currentStepIndex
                    ? "font-medium"
                    : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < WIZARD_STEPS.length - 1 && (
              <div
                className={cn(
                  "h-px w-6 sm:w-10",
                  i < currentStepIndex ? "bg-primary" : "bg-muted",
                )}
              />
            )}
          </div>
        ))}
      </nav>

      {/* Render current step */}
      {step === "upload" && <StepUpload onFileParsed={handleFileParsed} />}

      {step === "preview" && (
        <StepPreview
          fileName={fileName}
          headers={headers}
          rows={rows}
          onBack={handleReset}
          onContinue={() => setStep("mapping")}
        />
      )}

      {step === "mapping" && (
        <StepMapping
          headers={headers}
          rows={rows}
          mapping={mapping}
          defaults={defaults}
          updateExisting={updateExisting}
          onMappingChange={setMapping}
          onDefaultsChange={setDefaults}
          onUpdateExistingChange={setUpdateExisting}
          onBack={() => setStep("preview")}
          onConfirm={handleMappingConfirm}
        />
      )}

      {step === "processing" && <StepProcessing totalRows={rows.length} />}

      {step === "results" && results && (
        <StepResults results={results} onReset={handleReset} />
      )}
    </div>
  );
}
