"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  MoreHorizontal,
  Eye,
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  TRANSACTION_STATUS_CONFIG,
  type CardTransactionListItem,
} from "@/lib/ar/types";

// =============================================================================
// TransactionsTable — TanStack Table for AR card transactions
// =============================================================================
// Uses manualSorting (server-side) — TanStack only manages sort UI state.
// Simplified vs PayablesTable: no row selection, no transitions, no edit.
// =============================================================================

interface TransactionsTableProps {
  transactions: CardTransactionListItem[];
  loading: boolean;
  sort: string;
  order: "asc" | "desc";
  onSortChange: (columnId: string) => void;
}

// --- Helper: Format currency in BRL ---
function formatBRL(value: string): string {
  const num = Number(value);
  if (isNaN(num)) return value;
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// --- Helper: Format percentage ---
function formatPct(value: string): string {
  const num = Number(value);
  if (isNaN(num)) return value;
  return `${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

// --- Column Definitions ---
const columnHelper = createColumnHelper<CardTransactionListItem>();

function buildColumns() {
  return [
    // 1. Data Pagamento (sortable, color-coded)
    columnHelper.accessor("expectedPaymentDate", {
      id: "expectedPaymentDate",
      header: "Data Pagamento",
      cell: (info) => {
        const dateStr = info.getValue().split("T")[0];
        const date = new Date(dateStr + "T12:00:00");
        const formatted = format(date, "dd/MM/yyyy");
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntil = differenceInCalendarDays(date, today);
        const status = info.row.original.status;
        const isPending = status === "PENDING";

        let colorClass = "";
        if (isPending && daysUntil < 0) {
          colorClass = "text-red-600 dark:text-red-400 font-medium";
        } else if (isPending && daysUntil <= 7) {
          colorClass = "text-amber-600 dark:text-amber-400";
        }

        return <span className={colorClass}>{formatted}</span>;
      },
      enableSorting: true,
    }),

    // 2. Bandeira (sortable)
    columnHelper.accessor("brand", {
      id: "brand",
      header: "Bandeira",
      cell: (info) => <span>{info.getValue()}</span>,
      enableSorting: true,
    }),

    // 3. Adquirente (sortable, hidden on mobile)
    columnHelper.accessor("acquirer", {
      id: "acquirer",
      header: "Adquirente",
      cell: (info) => <span>{info.getValue()}</span>,
      enableSorting: true,
    }),

    // 4. Modalidade (not sortable, hidden on mobile)
    columnHelper.accessor("modality", {
      id: "modality",
      header: "Modalidade",
      cell: (info) => (
        <span className="text-muted-foreground">{info.getValue()}</span>
      ),
      enableSorting: false,
    }),

    // 5. Valor Bruto (sortable, right-aligned)
    columnHelper.accessor("grossAmount", {
      id: "grossAmount",
      header: "Valor Bruto",
      cell: (info) => (
        <span className="tabular-nums">{formatBRL(info.getValue())}</span>
      ),
      enableSorting: true,
    }),

    // 6. Taxa (not sortable, right-aligned, hidden on mobile)
    columnHelper.display({
      id: "fee",
      header: "Taxa",
      cell: (info) => {
        const { feeAmount, feePct } = info.row.original;
        return (
          <span className="tabular-nums text-muted-foreground">
            {formatBRL(feeAmount)}{" "}
            <span className="text-xs">({formatPct(feePct)})</span>
          </span>
        );
      },
    }),

    // 7. Valor Líquido (sortable, right-aligned, bold)
    columnHelper.accessor("netAmount", {
      id: "netAmount",
      header: "Valor Líquido",
      cell: (info) => (
        <span className="tabular-nums font-medium">
          {formatBRL(info.getValue())}
        </span>
      ),
      enableSorting: true,
    }),

    // 8. Status (sortable)
    columnHelper.accessor("status", {
      id: "status",
      header: "Status",
      cell: (info) => {
        const config = TRANSACTION_STATUS_CONFIG[info.getValue()] ?? {
          label: info.getValue(),
          variant: "outline" as const,
        };
        return <Badge variant={config.variant}>{config.label}</Badge>;
      },
      enableSorting: true,
    }),

    // 9. Ações (placeholder — future issues add confirm/diverge)
    columnHelper.display({
      id: "actions",
      header: () => <span className="sr-only">Ações</span>,
      cell: () => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Abrir menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhes
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    }),
  ];
}

// --- Responsive visibility classes per column ---
const COLUMN_CLASSES: Record<string, string> = {
  acquirer: "hidden lg:table-cell",
  modality: "hidden lg:table-cell",
  fee: "hidden lg:table-cell",
};

// --- Right-aligned column IDs ---
const RIGHT_ALIGNED = new Set(["grossAmount", "fee", "netAmount"]);

export function TransactionsTable({
  transactions,
  loading,
  sort,
  order,
  onSortChange,
}: TransactionsTableProps) {
  const columns = buildColumns();

  // Convert sort/order props into TanStack's SortingState format
  const sorting: SortingState = [{ id: sort, desc: order === "desc" }];

  const table = useReactTable({
    data: transactions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    enableSortingRemoval: false,
    state: { sorting },
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const isSorted = header.column.getIsSorted();
                const cellClass = COLUMN_CLASSES[header.id] ?? "";
                const alignClass = RIGHT_ALIGNED.has(header.id)
                  ? "text-right"
                  : "";

                return (
                  <TableHead
                    key={header.id}
                    className={cn(cellClass, alignClass)}
                  >
                    {canSort ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8"
                        onClick={() => onSortChange(header.id)}
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
          {/* Loading state: skeleton rows */}
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`skeleton-${i}`}>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-24" /></TableCell>
                <TableCell className="hidden lg:table-cell text-right"><Skeleton className="ml-auto h-4 w-28" /></TableCell>
                <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                <TableCell><Skeleton className="h-8 w-8" /></TableCell>
              </TableRow>
            ))}

          {/* Empty state */}
          {!loading && table.getRowModel().rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                Nenhuma transação encontrada.
              </TableCell>
            </TableRow>
          )}

          {/* Data rows */}
          {!loading &&
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const cellClass = COLUMN_CLASSES[cell.column.id] ?? "";
                  const alignClass = RIGHT_ALIGNED.has(cell.column.id)
                    ? "text-right"
                    : "";
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn(cellClass, alignClass)}
                    >
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
  );
}
