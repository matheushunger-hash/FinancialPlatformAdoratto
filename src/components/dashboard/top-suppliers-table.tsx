"use client";

import { Separator } from "@/components/ui/separator";
import type { TopSupplier } from "@/lib/dashboard/types";

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface TopSuppliersTableProps {
  suppliers: TopSupplier[];
  grandTotal: number;
}

export function TopSuppliersTable({
  suppliers,
  grandTotal,
}: TopSuppliersTableProps) {
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
                  <td className="max-w-[140px] truncate py-1.5 font-medium">
                    {supplier.supplierName}
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
