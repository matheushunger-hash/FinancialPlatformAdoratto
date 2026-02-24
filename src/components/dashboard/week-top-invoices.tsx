"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { PayableListItem } from "@/lib/payables/types";

// -- Helpers --

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateBR(iso: string): string {
  const d = iso.split("T")[0];
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

// Active statuses that appear in the weekly chart (PENDING/APPROVED with dueDate check)
const ACTIVE_STATUSES = "PENDING,APPROVED";

interface WeekTopInvoicesProps {
  weekStart: string; // "2026-02-21" ISO date
  weekEnd: string; // "2026-02-27" ISO date
  weekLabel: string; // "21/02 – 27/02"
  onDrillDown?: () => void; // Open the full drill-down sheet for this week
}

export function WeekTopInvoices({
  weekStart,
  weekEnd,
  weekLabel,
  onDrillDown,
}: WeekTopInvoicesProps) {
  const [invoices, setInvoices] = useState<PayableListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      dueDateFrom: weekStart,
      dueDateTo: weekEnd,
      status: ACTIVE_STATUSES,
      sort: "payValue",
      order: "desc",
      pageSize: "10",
      page: "1",
    });

    fetch(`/api/payables?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error("Falha ao carregar notas");
        return res.json();
      })
      .then((json) => {
        setInvoices(json.payables ?? []);
        setLoading(false);
      })
      .catch(() => {
        setInvoices([]);
        setLoading(false);
      });
  }, [weekStart, weekEnd]);

  // Determine if a payable is overdue (active status + dueDate < today)
  function isOverdue(p: PayableListItem): boolean {
    return (p.daysOverdue ?? 0) > 0;
  }

  if (loading) {
    return (
      <div className="pt-4">
        <Separator className="mb-4" />
        <Skeleton className="mb-3 h-5 w-56" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pt-4">
      <Separator className="mb-4" />
      {/* Header row with title + "Ver todos" link */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          Top 10 NFs — Semana {weekLabel}
        </p>
        {onDrillDown && (
          <button
            type="button"
            onClick={onDrillDown}
            className="text-xs font-medium text-primary hover:underline"
          >
            Ver todos &rarr;
          </button>
        )}
      </div>

      {invoices.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Nenhuma nota fiscal pendente nesta semana.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="pb-2 text-left font-medium">#</th>
                <th className="pb-2 text-left font-medium">NF</th>
                <th className="pb-2 text-left font-medium">Fornecedor</th>
                <th className="pb-2 text-right font-medium">Valor (R$)</th>
                <th className="pb-2 text-right font-medium">Vencimento</th>
                <th className="pb-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((p, i) => {
                const overdue = isOverdue(p);
                return (
                  <tr
                    key={p.id}
                    className="border-b last:border-0"
                  >
                    <td className="py-1.5 text-muted-foreground">{i + 1}</td>
                    <td className="max-w-[80px] truncate py-1.5 font-medium">
                      {p.invoiceNumber || "—"}
                    </td>
                    <td className="max-w-[160px] truncate py-1.5">
                      {p.supplierName ?? p.payee ?? "Avulso"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-medium">
                      {formatBRL(Number(p.payValue))}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                      {formatDateBR(p.dueDate)}
                    </td>
                    <td className="py-1.5 text-right">
                      {overdue ? (
                        <Badge
                          variant="destructive"
                          className="inline-flex w-[62px] justify-center text-[10px] px-1.5 py-0"
                        >
                          Vencido
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="inline-flex w-[62px] justify-center text-[10px] px-1.5 py-0"
                        >
                          Pendente
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
