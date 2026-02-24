"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

interface BatchItem {
  id: string;
  filename: string;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  grossTotal: string;
  netTotal: string;
  dateFrom: string;
  dateTo: string;
  importedAt: string;
  importedBy: { id: string; name: string };
}

interface BatchHistoryProps {
  refreshKey: number;
}

export function ARBatchHistory({ refreshKey }: BatchHistoryProps) {
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/ar/import/batches?page=${page}&pageSize=10`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        setBatches(json.data ?? []);
        setTotalPages(json.totalPages ?? 1);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, refreshKey]);

  // Reset to page 1 when a new import happens
  useEffect(() => {
    setPage(1);
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma importação realizada.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {batches.map((batch) => (
        <div
          key={batch.id}
          className="space-y-1 rounded-lg border bg-card p-3"
        >
          <div className="flex items-center justify-between">
            <span className="truncate font-medium">{batch.filename}</span>
            <Badge variant="outline">{batch.acceptedRows} aceitas</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              {batch.dateFrom} – {batch.dateTo}
            </span>
            <span className="tabular-nums">
              {formatBRL(Number(batch.netTotal))}
            </span>
            <span>{batch.importedBy.name}</span>
            <span>
              {formatDistanceToNow(new Date(batch.importedAt), {
                addSuffix: true,
                locale: ptBR,
              })}
            </span>
          </div>
        </div>
      ))}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
