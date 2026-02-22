"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import type { RawRow } from "@/lib/import/types";

// =============================================================================
// Step 1: Upload — Drag-and-drop zone for .xlsx / .csv files
// =============================================================================
// Same native HTML5 drag-and-drop pattern as file-upload-zone.tsx.
// Parses the file client-side using SheetJS — no upload to server.
// The parsed rows, headers, and file name are passed to the orchestrator.
// =============================================================================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "text/csv",
  "application/vnd.ms-excel", // .xls
];

interface StepUploadProps {
  onFileParsed: (fileName: string, headers: string[], rows: RawRow[]) => void;
}

export function StepUpload({ onFileParsed }: StepUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function processFile(file: File) {
    // Validate type
    if (!ACCEPTED_TYPES.includes(file.type) && !file.name.match(/\.(xlsx|csv|xls)$/i)) {
      toast.error("Tipo de arquivo não suportado. Use .xlsx ou .csv");
      return;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo: 10 MB.`);
      return;
    }

    setParsing(true);

    try {
      // Read file as ArrayBuffer for SheetJS
      const arrayBuffer = await file.arrayBuffer();

      // raw: true preserves numbers (critical for CNPJs stored as numbers in Excel)
      const workbook = XLSX.read(arrayBuffer, { type: "array", raw: true });

      // Use the first sheet
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Convert to array of objects — each key is a column header
      const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { raw: true });

      if (rows.length === 0) {
        toast.error("A planilha está vazia. Verifique o arquivo e tente novamente.");
        setParsing(false);
        return;
      }

      // Extract headers from the first row's keys
      const headers = Object.keys(rows[0]);

      onFileParsed(file.name, headers, rows);
    } catch {
      toast.error("Erro ao ler o arquivo. Verifique se o formato está correto.");
    } finally {
      setParsing(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (parsing) return;

    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!parsing) setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold">Selecione a planilha</h2>
        <p className="text-sm text-muted-foreground">
          Arraste um arquivo .xlsx ou .csv ou clique para selecionar
        </p>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !parsing && inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          parsing && "pointer-events-none opacity-50",
        )}
      >
        <Upload className="h-10 w-10 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">
            {parsing ? "Lendo planilha..." : "Arraste o arquivo aqui ou clique para selecionar"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            .xlsx, .csv — máximo 10 MB
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv,.xls"
          onChange={handleInputChange}
          className="hidden"
        />
      </div>

      <p className="text-center text-xs text-muted-foreground">
        A planilha é processada no navegador. Nenhum arquivo é enviado ao servidor.
      </p>
    </div>
  );
}
