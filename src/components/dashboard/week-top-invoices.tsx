"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { DISPLAY_STATUS_CONFIG } from "@/lib/payables/status";
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

// Active display statuses shown in the weekly chart (everything except cancelled/protested)
const ACTIVE_DISPLAY_STATUSES = "A_VENCER,VENCE_HOJE,VENCIDO,APROVADO,SEGURADO,PAGO";

// Sortable column keys (NF is intentionally excluded)
type SortField = "supplierName" | "payValue" | "dueDate" | "status";
type SortOrder = "asc" | "desc";

// Default sort: highest value first
const DEFAULT_SORT: { field: SortField; order: SortOrder } = {
  field: "payValue",
  order: "desc",
};

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
  const [sort, setSort] = useState<{ field: SortField; order: SortOrder }>(DEFAULT_SORT);

  useEffect(() => {
    setLoading(true);
    setSort(DEFAULT_SORT); // Reset sort when week changes
    const params = new URLSearchParams({
      dueDateFrom: weekStart,
      dueDateTo: weekEnd,
      displayStatus: ACTIVE_DISPLAY_STATUSES,
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

  // Display status rank: groups by urgency for sorting
  // Lower rank = more urgent (Vencido first when desc)
  function statusRank(p: PayableListItem): number {
    if (p.displayStatus === "PAGO") return 3;
    if (p.displayStatus === "VENCIDO") return 0;
    if (p.displayStatus === "VENCE_HOJE") return 1;
    return 2; // A_VENCER, APROVADO, SEGURADO, etc.
  }

  // Client-side sort (only 10 items, no need to re-fetch)
  const sorted = useMemo(() => {
    const arr = [...invoices];
    const dir = sort.order === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sort.field) {
        case "supplierName": {
          const nameA = (a.supplierName ?? a.payee ?? "").toLowerCase();
          const nameB = (b.supplierName ?? b.payee ?? "").toLowerCase();
          return nameA.localeCompare(nameB) * dir;
        }
        case "payValue":
          return (Number(a.payValue) - Number(b.payValue)) * dir;
        case "dueDate":
          return a.dueDate.localeCompare(b.dueDate) * dir;
        case "status": {
          const ra = statusRank(a);
          const rb = statusRank(b);
          return (ra - rb) * dir;
        }
        default:
          return 0;
      }
    });
    return arr;
  }, [invoices, sort]);

  // Toggle sort: same field flips direction, new field starts desc (value/status) or asc (name/date)
  function handleSort(field: SortField) {
    setSort((prev) => {
      if (prev.field === field) {
        return { field, order: prev.order === "asc" ? "desc" : "asc" };
      }
      const defaultOrder: SortOrder =
        field === "payValue" || field === "status" ? "desc" : "asc";
      return { field, order: defaultOrder };
    });
  }

  // Sort indicator icon for column header
  function SortIcon({ field }: { field: SortField }) {
    if (sort.field !== field) {
      return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    }
    return sort.order === "asc"
      ? <ArrowUp className="ml-1 inline h-3 w-3" />
      : <ArrowDown className="ml-1 inline h-3 w-3" />;
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
                <th
                  className="cursor-pointer select-none pb-2 text-left font-medium hover:text-foreground"
                  onClick={() => handleSort("supplierName")}
                >
                  Fornecedor
                  <SortIcon field="supplierName" />
                </th>
                <th
                  className="cursor-pointer select-none pb-2 text-right font-medium hover:text-foreground"
                  onClick={() => handleSort("payValue")}
                >
                  Valor (R$)
                  <SortIcon field="payValue" />
                </th>
                <th
                  className="cursor-pointer select-none pb-2 text-right font-medium hover:text-foreground"
                  onClick={() => handleSort("dueDate")}
                >
                  Vencimento
                  <SortIcon field="dueDate" />
                </th>
                <th
                  className="cursor-pointer select-none pb-2 text-right font-medium hover:text-foreground"
                  onClick={() => handleSort("status")}
                >
                  Status
                  <SortIcon field="status" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => {
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
                      {(() => {
                        const dsCfg = DISPLAY_STATUS_CONFIG[p.displayStatus];
                        return (
                          <Badge
                            variant={dsCfg?.variant ?? "outline"}
                            className="inline-flex w-[72px] justify-center text-[10px] px-1.5 py-0"
                          >
                            {dsCfg?.label ?? p.displayStatus}
                          </Badge>
                        );
                      })()}
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
