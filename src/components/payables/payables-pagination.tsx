"use client";

import { Button } from "@/components/ui/button";

interface PayablesPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  currentCount: number; // Items on the current page (may be less than pageSize on last page)
  onPageChange: (page: number) => void;
}

export function PayablesPagination({
  page,
  totalPages,
  total,
  currentCount,
  onPageChange,
}: PayablesPaginationProps) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Mostrando {currentCount} de {total} título{total !== 1 ? "s" : ""}
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
