"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ARImportDropzone } from "@/components/ar/ar-import-dropzone";
import {
  ARImportResults,
  type ImportResult,
  type ImportError,
} from "@/components/ar/ar-import-results";
import { ARBatchHistory } from "@/components/ar/ar-batch-history";

type ImportState = "idle" | "uploading" | "done";

export function ARImportView() {
  const [state, setState] = useState<ImportState>("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<ImportError | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function handleImport(file: File) {
    setState("uploading");
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/ar/import", {
        method: "POST",
        body: formData,
        // Do NOT set Content-Type — browser sets it with correct boundary
      });

      const json = await res.json();

      if (!res.ok) {
        const errData = json.error;
        if (typeof errData === "object" && errData.code) {
          setError({
            code: errData.code,
            message: errData.message,
            existingBatchId: errData.existingBatchId,
          });
        } else {
          setError({
            message:
              typeof errData === "string" ? errData : "Erro desconhecido",
          });
        }
        setState("done");
        return;
      }

      setResult(json.data);
      setRefreshKey((k) => k + 1);
      setState("done");
    } catch {
      setError({ message: "Erro de conexão. Tente novamente." });
      setState("done");
    }
  }

  function handleReset() {
    setState("idle");
    setResult(null);
    setError(null);
  }

  return (
    <div className="space-y-8">
      {state === "idle" && (
        <ARImportDropzone onImport={handleImport} />
      )}

      {state === "uploading" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">
              Importando arquivo...
            </p>
          </CardContent>
        </Card>
      )}

      {state === "done" && (
        <ARImportResults
          result={result}
          error={error}
          onReset={handleReset}
        />
      )}

      <Separator />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Importações Anteriores</h2>
        <ARBatchHistory refreshKey={refreshKey} />
      </div>
    </div>
  );
}
