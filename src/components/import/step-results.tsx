"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle, Truck } from "lucide-react";
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
import type { ImportResponse } from "@/lib/import/types";

// =============================================================================
// Step 5: Results — Summary cards + error details + action buttons
// =============================================================================
// Shows how many payables were imported, suppliers created, and any errors.
// The error table is expandable — only rendered when there are errors.
// =============================================================================

interface StepResultsProps {
  results: ImportResponse;
  onReset: () => void;
}

export function StepResults({ results, onReset }: StepResultsProps) {
  const hasErrors = results.errors.length > 0;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="rounded-full bg-green-500/10 p-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{results.created}</p>
              <p className="text-sm text-muted-foreground">Títulos Importados</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="rounded-full bg-blue-500/10 p-2">
              <Truck className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{results.suppliersCreated}</p>
              <p className="text-sm text-muted-foreground">Fornecedores Criados</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className={`rounded-full p-2 ${hasErrors ? "bg-red-500/10" : "bg-amber-500/10"}`}>
              <AlertCircle
                className={`h-5 w-5 ${hasErrors ? "text-red-600" : "text-amber-600"}`}
              />
            </div>
            <div>
              <p className="text-2xl font-bold">{results.errors.length}</p>
              <p className="text-sm text-muted-foreground">Erros</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Error table — only shown when there are errors */}
      {hasErrors && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detalhes dos Erros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[300px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Linha</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.errors.map((err, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono">{err.row}</TableCell>
                      <TableCell>{err.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onReset}>
          Nova Importação
        </Button>
        <Button asChild>
          <Link href="/dashboard/contas-a-pagar">Ver Contas a Pagar</Link>
        </Button>
      </div>
    </div>
  );
}
