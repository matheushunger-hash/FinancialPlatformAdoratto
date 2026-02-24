"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export interface ImportResult {
  batchId: string;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  grossTotal: string;
  netTotal: string;
  dateFrom: string;
  dateTo: string;
  rejectedItems: { row: number; reason: string }[];
}

export interface ImportError {
  code?: string;
  message: string;
  existingBatchId?: string;
}

interface ImportResultsProps {
  result: ImportResult | null;
  error: ImportError | null;
  onReset: () => void;
}

export function ARImportResults({ result, error, onReset }: ImportResultsProps) {
  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">
            Erro na Importação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{error.message}</p>
          {error.code === "DUPLICATE_BATCH" && (
            <p className="text-sm text-muted-foreground">
              Um lote com este período já foi importado.
            </p>
          )}
          <Button variant="outline" onClick={onReset}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!result) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Importação Concluída</CardTitle>
          <Badge variant="default">{result.acceptedRows} aceitas</Badge>
          {result.rejectedRows > 0 && (
            <Badge variant="destructive">
              {result.rejectedRows} rejeitadas
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Período</p>
            <p className="text-sm font-medium">
              {result.dateFrom} – {result.dateTo}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Valor Bruto</p>
            <p className="text-sm font-medium tabular-nums">
              {formatBRL(Number(result.grossTotal))}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Valor Líquido</p>
            <p className="text-sm font-medium tabular-nums">
              {formatBRL(Number(result.netTotal))}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-sm font-medium">
              {result.totalRows} linhas
            </p>
          </div>
        </div>

        {result.rejectedRows > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium text-destructive">
                Linhas rejeitadas:
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {result.rejectedItems.map((item, i) => (
                  <li key={i}>
                    Linha {item.row}: {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onReset}>
            Importar outro arquivo
          </Button>
          <Button asChild>
            <Link
              href={`/dashboard/recebimentos/transacoes?batchId=${result.batchId}`}
            >
              Ver transações importadas
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
