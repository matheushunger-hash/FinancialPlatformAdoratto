"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_CONFIG } from "@/lib/payables/types";
import type { PayableListItem, PayablesListResponse } from "@/lib/payables/types";
import type { DrillDownFilter } from "@/lib/dashboard/types";

// =============================================================================
// DrillDownSheet — Displays filtered payables for a chart click (#47)
// =============================================================================
// Opens when the user clicks a bar in the dashboard charts. Shows up to 10
// matching payables in a lightweight read-only table, with a "Ver todos" link
// to navigate to the full payables page with pre-applied filters.
// =============================================================================

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Format "2026-02-15" → "15/02/2026"
function formatDate(isoDate: string): string {
  const parts = isoDate.split("T")[0].split("-");
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// Build the URL for "Ver todos" — navigates to /contas-a-pagar with filters
function buildPayablesUrl(filter: DrillDownFilter): string {
  const params = new URLSearchParams();
  if (filter.supplierId) params.set("supplierId", filter.supplierId);
  if (filter.status) params.set("status", filter.status);
  params.set("dueDateFrom", filter.dueDateFrom);
  params.set("dueDateTo", filter.dueDateTo);
  return `/contas-a-pagar?${params.toString()}`;
}

interface DrillDownSheetProps {
  filter: DrillDownFilter | null; // null = closed
  onOpenChange: (open: boolean) => void;
}

export function DrillDownSheet({ filter, onOpenChange }: DrillDownSheetProps) {
  const [payables, setPayables] = useState<PayableListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPayables = useCallback(async () => {
    if (!filter) return;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (filter.supplierId) params.set("supplierId", filter.supplierId);
    if (filter.status) params.set("status", filter.status);
    params.set("dueDateFrom", filter.dueDateFrom);
    params.set("dueDateTo", filter.dueDateTo);
    params.set("pageSize", "10");
    params.set("sort", "dueDate");
    params.set("order", "asc");

    try {
      const res = await fetch(`/api/payables?${params.toString()}`);
      if (!res.ok) throw new Error("Falha ao carregar títulos");
      const data: PayablesListResponse = await res.json();
      setPayables(data.payables);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar títulos");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (!filter) {
      setPayables([]);
      setTotal(0);
      setError(null);
      return;
    }
    fetchPayables();
  }, [filter, fetchPayables]);

  const isOpen = filter !== null;
  const isSupplierDrillDown = !!filter?.supplierId;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{filter?.title ?? "Detalhamento"}</SheetTitle>
          <SheetDescription>
            {loading
              ? "Carregando..."
              : `${total} título${total !== 1 ? "s" : ""} encontrado${total !== 1 ? "s" : ""}`}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4">
          {/* Error state */}
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20 ml-auto" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && payables.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum título encontrado para este filtro.
            </p>
          )}

          {/* Data table */}
          {!loading && !error && payables.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  {!isSupplierDrillDown && (
                    <th className="pb-2 font-medium">Fornecedor</th>
                  )}
                  <th className="pb-2 font-medium">Descrição</th>
                  <th className="pb-2 font-medium">Vencimento</th>
                  <th className="pb-2 text-right font-medium">Valor</th>
                  <th className="pb-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payables.map((p) => {
                  const cfg = STATUS_CONFIG[p.status.toUpperCase()];
                  return (
                    <tr key={p.id} className="border-b last:border-0">
                      {!isSupplierDrillDown && (
                        <td className="py-2.5 pr-2 max-w-[140px] truncate" title={p.supplierName}>
                          {p.supplierName}
                        </td>
                      )}
                      <td className="py-2.5 pr-2 max-w-[160px] truncate" title={p.description}>
                        {p.description}
                      </td>
                      <td className="py-2.5 pr-2 whitespace-nowrap">
                        {formatDate(p.dueDate)}
                      </td>
                      <td className="py-2.5 pr-2 text-right tabular-nums whitespace-nowrap">
                        {formatBRL(Number(p.payValue))}
                      </td>
                      <td className="py-2.5 text-right">
                        <Badge variant={cfg?.variant ?? "outline"}>
                          {cfg?.label ?? p.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer with "Ver todos" link */}
        {!loading && !error && filter && total > 0 && (
          <SheetFooter className="px-4 pb-4">
            <Link
              href={buildPayablesUrl(filter)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Ver todos na tabela completa
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
