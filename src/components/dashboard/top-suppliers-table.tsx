"use client";

import { useState } from "react";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2 } from "lucide-react";
import type { TopSupplier } from "@/lib/dashboard/types";
import type { PayableListItem } from "@/lib/payables/types";

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatShortDate(iso: string): string {
  const d = iso.split("T")[0];
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

interface TopSuppliersTableProps {
  suppliers: TopSupplier[];
  grandTotal: number;
  weekStart: string;
  weekEnd: string;
}

export function TopSuppliersTable({
  suppliers,
  grandTotal,
  weekStart,
  weekEnd,
}: TopSuppliersTableProps) {
  const [openSupplierId, setOpenSupplierId] = useState<string | null>(null);
  const [payables, setPayables] = useState<PayableListItem[]>([]);
  const [loadingPayables, setLoadingPayables] = useState(false);

  async function handleSupplierClick(supplierId: string | null) {
    if (!supplierId) return;
    if (openSupplierId === supplierId) {
      setOpenSupplierId(null);
      return;
    }
    setOpenSupplierId(supplierId);
    setLoadingPayables(true);
    try {
      const params = new URLSearchParams({
        supplierId,
        dueDateFrom: weekStart,
        dueDateTo: weekEnd,
        status: "PENDING,APPROVED",
        pageSize: "50",
      });
      const res = await fetch(`/api/payables?${params}`);
      const json = await res.json();
      setPayables(json.payables ?? []);
    } finally {
      setLoadingPayables(false);
    }
  }

  if (suppliers.length === 0) {
    return (
      <>
        <Separator />
        <div className="pt-3">
          <p className="text-xs font-medium text-muted-foreground">
            Top 10 Fornecedores
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Nenhum fornecedor nesta semana.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <Separator />
      <div className="pt-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Top 10 Fornecedores da Semana
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="pb-2 text-left font-medium">#</th>
              <th className="pb-2 text-left font-medium">Fornecedor</th>
              <th className="pb-2 text-right font-medium">Valor</th>
              <th className="pb-2 text-right font-medium">Qtd.</th>
              <th className="pb-2 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((supplier, i) => {
              const pct =
                grandTotal > 0
                  ? ((supplier.total / grandTotal) * 100).toFixed(1)
                  : "0.0";
              return (
                <tr
                  key={supplier.supplierId ?? `no-supplier-${i}`}
                  className="border-b last:border-0"
                >
                  <td className="py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="py-1.5">
                    <Popover
                      open={openSupplierId === supplier.supplierId}
                      onOpenChange={(open) => !open && setOpenSupplierId(null)}
                    >
                      <PopoverTrigger asChild>
                        <button
                          className="max-w-[140px] truncate text-left font-medium cursor-pointer hover:underline"
                          onClick={() => handleSupplierClick(supplier.supplierId)}
                        >
                          {supplier.supplierName}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-80 max-h-64 overflow-y-auto p-3">
                        {loadingPayables ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : payables.length === 0 ? (
                          <p className="py-2 text-sm text-muted-foreground">
                            Nenhum pagamento encontrado
                          </p>
                        ) : (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              {payables.length} pagamento(s)
                            </p>
                            {payables.map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center justify-between py-1.5 border-b last:border-0"
                              >
                                <div className="flex flex-col min-w-0 mr-2">
                                  <span className="text-sm font-medium truncate">
                                    {p.description || "Sem descrição"}
                                  </span>
                                  <span
                                    className={`text-xs ${
                                      p.daysOverdue && p.daysOverdue > 0
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-muted-foreground"
                                    }`}
                                  >
                                    {p.daysOverdue && p.daysOverdue > 0
                                      ? `${p.daysOverdue}d vencido`
                                      : `Vence ${formatShortDate(p.dueDate)}`}
                                  </span>
                                </div>
                                <span className="text-sm font-medium tabular-nums whitespace-nowrap">
                                  {formatBRL(Number(p.payValue))}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatBRL(supplier.total)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {supplier.count}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {pct}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
