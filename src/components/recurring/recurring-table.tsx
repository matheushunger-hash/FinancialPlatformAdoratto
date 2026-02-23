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
  Pencil,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FREQUENCY_LABELS, type RecurringListItem } from "@/lib/recurring/types";

// =============================================================================
// RecurringTable — TanStack table for recurring payable templates
// =============================================================================

function formatBRL(value: string): string {
  const num = Number(value);
  if (isNaN(num)) return value;
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Responsive column visibility
const COLUMN_CLASSES: Record<string, string> = {
  supplierName: "",
  description: "hidden lg:table-cell",
  amount: "",
  frequency: "hidden md:table-cell",
  dayOfMonth: "hidden lg:table-cell",
  startDate: "hidden md:table-cell",
  active: "hidden sm:table-cell",
  actions: "",
};

const columnHelper = createColumnHelper<RecurringListItem>();

interface RecurringTableProps {
  items: RecurringListItem[];
  loading: boolean;
  sort: string;
  order: "asc" | "desc";
  onSortChange: (column: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, currentActive: boolean) => void;
  userRole: string;
}

export function RecurringTable({
  items,
  loading,
  sort,
  order,
  onSortChange,
  onEdit,
  onDelete,
  onToggleActive,
  userRole,
}: RecurringTableProps) {
  const columns = [
    columnHelper.accessor("supplierName", {
      id: "supplierName",
      header: "Fornecedor",
      cell: (info) => (
        <Link
          href={`/dashboard/fornecedores/${info.row.original.supplierId}`}
          className="font-medium hover:underline"
        >
          {info.getValue()}
        </Link>
      ),
      enableSorting: true,
    }),
    columnHelper.accessor("description", {
      id: "description",
      header: "Descrição",
      cell: (info) => (
        <span className="text-muted-foreground">{info.getValue()}</span>
      ),
      enableSorting: true,
    }),
    columnHelper.accessor("amount", {
      id: "amount",
      header: "Valor",
      cell: (info) => (
        <span className="tabular-nums">{formatBRL(info.getValue())}</span>
      ),
      enableSorting: true,
    }),
    columnHelper.accessor("frequency", {
      id: "frequency",
      header: "Frequência",
      cell: (info) => (
        <Badge variant="outline">
          {FREQUENCY_LABELS[info.getValue()] ?? info.getValue()}
        </Badge>
      ),
      enableSorting: true,
    }),
    columnHelper.accessor("dayOfMonth", {
      id: "dayOfMonth",
      header: "Dia",
      cell: (info) => {
        const day = info.getValue();
        return day !== null ? (
          <span className="tabular-nums">Dia {day}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
      enableSorting: false,
    }),
    columnHelper.accessor("startDate", {
      id: "startDate",
      header: "Início",
      cell: (info) => {
        const val = info.getValue();
        if (!val) return "—";
        return format(new Date(val.split("T")[0] + "T12:00:00"), "dd/MM/yyyy");
      },
      enableSorting: true,
    }),
    columnHelper.accessor("active", {
      id: "active",
      header: "Status",
      cell: (info) => {
        const active = info.getValue();
        return (
          <Badge variant={active ? "default" : "secondary"}>
            {active ? "Ativo" : "Inativo"}
          </Badge>
        );
      },
      enableSorting: true,
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex items-center justify-end gap-2">
            <Switch
              checked={item.active}
              onCheckedChange={() => onToggleActive(item.id, item.active)}
              aria-label={item.active ? "Desativar" : "Ativar"}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(item.id)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
                {userRole === "ADMIN" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(item.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    }),
  ];

  // TanStack sorting state — controlled externally by orchestrator
  const sorting: SortingState = [{ id: sort, desc: order === "desc" }];

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    state: { sorting },
    onSortingChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(sorting) : updater;
      if (next.length > 0) {
        onSortChange(next[0].id);
      }
    },
  });

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        <p className="text-muted-foreground">
          Nenhuma recorrência cadastrada.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const colClass = COLUMN_CLASSES[header.id] ?? "";
                const isSortable = header.column.getCanSort();
                const sortDir = header.column.getIsSorted();
                const isRightAligned = header.id === "amount";

                return (
                  <TableHead
                    key={header.id}
                    className={`${colClass} ${isRightAligned ? "text-right" : ""}`}
                    onClick={
                      isSortable
                        ? header.column.getToggleSortingHandler()
                        : undefined
                    }
                    style={isSortable ? { cursor: "pointer" } : undefined}
                  >
                    <div
                      className={`flex items-center gap-1 ${isRightAligned ? "justify-end" : ""}`}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {isSortable &&
                        (sortDir === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : sortDir === "desc" ? (
                          <ArrowDown className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                        ))}
                    </div>
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
                const colClass = COLUMN_CLASSES[cell.column.id] ?? "";
                const isRightAligned = cell.column.id === "amount";

                return (
                  <TableCell
                    key={cell.id}
                    className={`${colClass} ${isRightAligned ? "text-right" : ""}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
