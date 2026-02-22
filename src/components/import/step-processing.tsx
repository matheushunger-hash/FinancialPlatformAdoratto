"use client";

import { Loader2 } from "lucide-react";

// =============================================================================
// Step 4: Processing — Loading state while API processes rows
// =============================================================================

interface StepProcessingProps {
  totalRows: number;
}

export function StepProcessing({ totalRows }: StepProcessingProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <div className="text-center">
        <p className="text-lg font-medium">
          Processando {totalRows} linhas...
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Isso pode levar alguns segundos
        </p>
      </div>
    </div>
  );
}
