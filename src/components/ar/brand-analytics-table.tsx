"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { BrandCostAnalysis, BrandCostRow } from "@/lib/ar/types";

// =============================================================================
// BrandAnalyticsTable — Comparison table with client-side sorting (#73)
// =============================================================================

interface BrandAnalyticsTableProps {
  data: BrandCostAnalysis | null;
  loading: boolean;
}

function formatBRL(value: string): string {
  const num = Number(value);
  if (isNaN(num)) return value;
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(value: string): string {
  const num = Number(value);
  if (isNaN(num)) return value;
  return `${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function feeColorClass(avgFeePct: string): string {
  const num = Number(avgFeePct);
  if (num > 6) return "text-red-600 dark:text-red-400 font-medium";
  if (num > 5) return "text-amber-600 dark:text-amber-400 font-medium";
  return "";
}

const columnHelper = createColumnHelper<BrandCostRow>();

const columns = [
  columnHelper.accessor("brand", {
    header: "Bandeira",
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
    enableSorting: true,
  }),
  columnHelper.accessor("grossTotal", {
    header: "Volume Bruto",
    cell: (info) => (
      <span className="tabular-nums">{formatBRL(info.getValue())}</span>
    ),
    sortingFn: (a, b) => Number(a.original.grossTotal) - Number(b.original.grossTotal),
    enableSorting: true,
  }),
  columnHelper.accessor("netTotal", {
    header: "Volume Líquido",
    cell: (info) => (
      <span className="tabular-nums">{formatBRL(info.getValue())}</span>
    ),
    sortingFn: (a, b) => Number(a.original.netTotal) - Number(b.original.netTotal),
    enableSorting: true,
  }),
  columnHelper.accessor("feesTotal", {
    header: "Custo Total",
    cell: (info) => (
      <span className="tabular-nums font-semibold">{formatBRL(info.getValue())}</span>
    ),
    sortingFn: (a, b) => Number(a.original.feesTotal) - Number(b.original.feesTotal),
    enableSorting: true,
  }),
  columnHelper.accessor("avgFeePct", {
    header: "Taxa Média",
    cell: (info) => (
      <span className={cn("tabular-nums", feeColorClass(info.getValue()))}>
        {formatPct(info.getValue())}
      </span>
    ),
    sortingFn: (a, b) => Number(a.original.avgFeePct) - Number(b.original.avgFeePct),
    enableSorting: true,
  }),
  columnHelper.accessor("avgSettlementDays", {
    header: "Prazo Médio",
    cell: (info) => (
      <span className="tabular-nums">{info.getValue()} dias</span>
    ),
    enableSorting: true,
  }),
  columnHelper.accessor("transactionCount", {
    header: "Transações",
    cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
    enableSorting: true,
  }),
];

const RIGHT_ALIGNED = new Set([
  "grossTotal",
  "netTotal",
  "feesTotal",
  "avgFeePct",
  "avgSettlementDays",
  "transactionCount",
]);

export function BrandAnalyticsTable({ data, loading }: BrandAnalyticsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "feesTotal", desc: true },
  ]);

  const table = useReactTable({
    data: data?.brands ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting },
    onSortingChange: setSorting,
    enableSortingRemoval: false,
  });

  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Comparativo por Bandeira</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && (!data || data.brands.length === 0) && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma transação encontrada no período.
          </p>
        )}

        {/* Table */}
        {!loading && data && data.brands.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((header) => {
                      const canSort = header.column.getCanSort();
                      const isSorted = header.column.getIsSorted();
                      const align = RIGHT_ALIGNED.has(header.id)
                        ? "text-right"
                        : "";
                      return (
                        <TableHead key={header.id} className={align}>
                          {canSort ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="-ml-3 h-8"
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                              {isSorted === "asc" ? (
                                <ArrowUp className="ml-2 h-4 w-4" />
                              ) : isSorted === "desc" ? (
                                <ArrowDown className="ml-2 h-4 w-4" />
                              ) : (
                                <ArrowUpDown className="ml-2 h-4 w-4" />
                              )}
                            </Button>
                          ) : (
                            flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => {
                      const align = RIGHT_ALIGNED.has(cell.column.id)
                        ? "text-right"
                        : "";
                      return (
                        <TableCell key={cell.id} className={align}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
