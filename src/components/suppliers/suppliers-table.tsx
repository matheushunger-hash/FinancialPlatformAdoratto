"use client";

import Link from "next/link";
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
  Eye,
  MoreHorizontal,
  Pencil,
  Power,
} from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCNPJ, formatCPF } from "@/lib/suppliers/validation";
import type { SupplierListItem } from "@/lib/suppliers/types";

// =============================================================================
// SuppliersTable — TanStack table for supplier list
// =============================================================================
// Follows the same pattern as payables-table and recurring-table:
// columnHelper, COLUMN_CLASSES for responsive visibility, manual sorting
// controlled by the orchestrator.
// =============================================================================

function formatDocument(supplier: SupplierListItem): string {
  return supplier.documentType === "CNPJ"
    ? formatCNPJ(supplier.document)
    : formatCPF(supplier.document);
}

// Responsive column visibility
const COLUMN_CLASSES: Record<string, string> = {
  name: "",
  document: "",
  tradeName: "hidden md:table-cell",
  active: "",
  actions: "",
};

const columnHelper = createColumnHelper<SupplierListItem>();

interface SuppliersTableProps {
  suppliers: SupplierListItem[];
  loading: boolean;
  sort: string;
  order: "asc" | "desc";
  onSortChange: (column: string) => void;
  onEdit: (supplier: SupplierListItem) => void;
  onToggleActive: (supplier: SupplierListItem) => void;
}

export function SuppliersTable({
  suppliers,
  loading,
  sort,
  order,
  onSortChange,
  onEdit,
  onToggleActive,
}: SuppliersTableProps) {
  const columns = [
    columnHelper.accessor("name", {
      id: "name",
      header: "Nome",
      cell: (info) => (
        <Link
          href={`/dashboard/fornecedores/${info.row.original.id}`}
          className="font-medium hover:underline"
        >
          {info.getValue()}
        </Link>
      ),
      enableSorting: true,
    }),
    columnHelper.accessor("document", {
      id: "document",
      header: "CNPJ/CPF",
      cell: (info) => (
        <span className="font-mono text-sm">
          {formatDocument(info.row.original)}
        </span>
      ),
      enableSorting: true,
    }),
    columnHelper.accessor("tradeName", {
      id: "tradeName",
      header: "Nome Fantasia",
      cell: (info) => (
        <span className="text-muted-foreground">
          {info.getValue() || "—"}
        </span>
      ),
      enableSorting: false,
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
        const supplier = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Abrir menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/fornecedores/${supplier.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  Ver Detalhes
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onEdit(supplier)}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleActive(supplier)}>
                <Power className="mr-2 h-4 w-4" />
                {supplier.active ? "Desativar" : "Reativar"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    }),
  ];

  // TanStack sorting state — controlled externally by orchestrator
  const sorting: SortingState = [{ id: sort, desc: order === "desc" }];

  const table = useReactTable({
    data: suppliers,
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

                return (
                  <TableHead
                    key={header.id}
                    className={colClass}
                    onClick={
                      isSortable
                        ? header.column.getToggleSortingHandler()
                        : undefined
                    }
                    style={isSortable ? { cursor: "pointer" } : undefined}
                  >
                    <div className="flex items-center gap-1">
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
          {/* Loading state: skeleton rows inside the table */}
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`skeleton-${i}`}>
                <TableCell>
                  <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-40" />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Skeleton className="h-4 w-28" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-14" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-8 w-8" />
                </TableCell>
              </TableRow>
            ))}

          {/* Empty state */}
          {!loading && suppliers.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                Nenhum fornecedor encontrado.
              </TableCell>
            </TableRow>
          )}

          {/* Data rows */}
          {!loading &&
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const colClass = COLUMN_CLASSES[cell.column.id] ?? "";
                  return (
                    <TableCell key={cell.id} className={colClass}>
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
