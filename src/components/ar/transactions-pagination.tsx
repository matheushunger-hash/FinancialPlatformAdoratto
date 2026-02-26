"use client";

import { Button } from "@/components/ui/button";

interface TransactionsPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  currentCount: number;
  onPageChange: (page: number) => void;
}

export function TransactionsPagination({
  page,
  totalPages,
  total,
  currentCount,
  onPageChange,
}: TransactionsPaginationProps) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Mostrando {currentCount} de {total} transação{total !== 1 ? "ões" : ""}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            Próximo
          </Button>
        </div>
      )}
    </div>
  );
}
