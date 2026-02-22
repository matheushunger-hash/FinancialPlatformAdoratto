"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RawRow } from "@/lib/import/types";

// =============================================================================
// Step 2: Preview — Shows the first 10 rows in a scrollable table
// =============================================================================
// Lets the user verify the file was parsed correctly before mapping columns.
// Shows file name, total row count, and a horizontal-scrolling table.
// =============================================================================

const PREVIEW_ROWS = 10;

interface StepPreviewProps {
  fileName: string;
  headers: string[];
  rows: RawRow[];
  onBack: () => void;
  onContinue: () => void;
}

export function StepPreview({
  fileName,
  headers,
  rows,
  onBack,
  onContinue,
}: StepPreviewProps) {
  const previewRows = rows.slice(0, PREVIEW_ROWS);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-medium">{fileName}</CardTitle>
          <Badge variant="secondary">{rows.length} linhas</Badge>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map((header) => (
                    <TableHead key={header} className="whitespace-nowrap">
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {headers.map((header) => (
                      <TableCell
                        key={header}
                        className="max-w-[200px] truncate whitespace-nowrap"
                      >
                        {row[header] != null ? String(row[header]) : ""}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {rows.length > PREVIEW_ROWS && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Mostrando {PREVIEW_ROWS} de {rows.length} linhas
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={onContinue}>Continuar</Button>
      </div>
    </div>
  );
}
