"use client";

import { Button } from "@/components/ui/button";

interface PayablesPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function PayablesPagination({
  page,
  totalPages,
  total,
  onPageChange,
}: PayablesPaginationProps) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        {total} título{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}
      </p>
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
    </div>
  );
}
