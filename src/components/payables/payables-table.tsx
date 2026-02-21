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
  CheckCircle,
  CreditCard,
  MoreHorizontal,
  RotateCcw,
  XCircle,
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
import { formatCNPJ, formatCPF } from "@/lib/suppliers/validation";
import { getAvailableActions } from "@/lib/payables/transitions";
import type { PayableListItem } from "@/lib/payables/types";

// =============================================================================
// PayablesTable — TanStack Table rendering payables with shadcn UI
// =============================================================================
// Uses manualSorting (server-side) — TanStack only manages sort UI state.
// The parent component handles fetching sorted data from the API.
//
// 10 columns: Fornecedor, CNPJ/CPF, Categoria, Vencimento, Valor Original,
// Valor a Pagar, Juros/Multa, Status, Tags, Ações.
// =============================================================================

interface PayablesTableProps {
  payables: PayableListItem[];
  loading: boolean;
  sort: string;
  order: "asc" | "desc";
  onSortChange: (columnId: string) => void;
  userRole: string;
  onTransition: (id: string, action: string) => void;
  onRequestPay: (id: string) => void;
}

// --- Helper: Format currency in BRL ---
function formatBRL(value: string): string {
  const num = Number(value);
  if (isNaN(num)) return value;
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// --- Helper: Status badge configuration ---
const STATUS_CONFIG: Record<string, { label: string; variant: "outline" | "default" | "destructive" | "secondary" }> = {
  PENDING: { label: "Pendente", variant: "outline" },
  APPROVED: { label: "Aprovado", variant: "default" },
  REJECTED: { label: "Rejeitado", variant: "destructive" },
  PAID: { label: "Pago", variant: "default" },
  OVERDUE: { label: "Vencido", variant: "destructive" },
  CANCELLED: { label: "Cancelado", variant: "secondary" },
};

// --- Helper: Tag value → display label ---
const TAG_LABELS: Record<string, string> = {
  protestado: "Protestado",
  segurado: "Segurado",
  renegociado: "Renegociado",
  negativar: "Negativar",
  duplicado: "Duplicado",
  "sem-boleto": "Sem Boleto",
  "sem-faturamento": "Sem Faturamento",
};

// --- Icon per transition action ---
const ACTION_ICONS: Record<string, React.ReactNode> = {
  approve: <CheckCircle className="mr-2 h-4 w-4 text-green-600" />,
  reject: <XCircle className="mr-2 h-4 w-4" />,
  pay: <CreditCard className="mr-2 h-4 w-4" />,
  reopen: <RotateCcw className="mr-2 h-4 w-4" />,
};

// --- Column Definitions (factory — needs userRole and callbacks) ---
const columnHelper = createColumnHelper<PayableListItem>();

function buildColumns(
  userRole: string,
  onTransition: (id: string, action: string) => void,
  onRequestPay: (id: string) => void,
) {
  return [
    // 1. Fornecedor (sortable)
    columnHelper.accessor("supplierName", {
      id: "supplierName",
      header: "Fornecedor",
      cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      enableSorting: true,
    }),

    // 2. CNPJ/CPF (not sortable, hidden on mobile)
    columnHelper.accessor("supplierDocument", {
      id: "supplierDocument",
      header: "CNPJ/CPF",
      cell: (info) => {
        const row = info.row.original;
        const formatted =
          row.supplierDocumentType === "CNPJ"
            ? formatCNPJ(row.supplierDocument)
            : formatCPF(row.supplierDocument);
        return <span className="font-mono text-sm">{formatted}</span>;
      },
      enableSorting: false,
    }),

    // 3. Categoria (not sortable)
    columnHelper.accessor("category", {
      id: "category",
      header: "Categoria",
      cell: (info) => {
        const value = info.getValue();
        return (
          <Badge variant={value === "REVENDA" ? "default" : "secondary"}>
            {value === "REVENDA" ? "Revenda" : "Despesa"}
          </Badge>
        );
      },
      enableSorting: false,
    }),

    // 4. Vencimento (sortable, dynamic colors)
    columnHelper.accessor("dueDate", {
      id: "dueDate",
      header: "Vencimento",
      cell: (info) => {
        const dateStr = info.getValue();
        const date = new Date(dateStr);
        const formatted = format(date, "dd/MM/yyyy");
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntilDue = differenceInCalendarDays(date, today);
        const row = info.row.original;
        const isPending = row.status === "PENDING";

        let colorClass = "";
        if (isPending && daysUntilDue < 0) {
          colorClass = "text-red-600 dark:text-red-400 font-medium";
        } else if (isPending && daysUntilDue <= 7) {
          colorClass = "text-amber-600 dark:text-amber-400";
        }

        return <span className={colorClass}>{formatted}</span>;
      },
      enableSorting: true,
    }),

    // 5. Valor Original (sortable, right-aligned)
    columnHelper.accessor("amount", {
      id: "amount",
      header: "Valor Original",
      cell: (info) => (
        <span className="tabular-nums">{formatBRL(info.getValue())}</span>
      ),
      enableSorting: true,
    }),

    // 6. Valor a Pagar (sortable, right-aligned, bold)
    columnHelper.accessor("payValue", {
      id: "payValue",
      header: "Valor a Pagar",
      cell: (info) => (
        <span className="tabular-nums font-medium">
          {formatBRL(info.getValue())}
        </span>
      ),
      enableSorting: true,
    }),

    // 7. Juros/Multa (calculated, not sortable, hidden on mobile)
    columnHelper.display({
      id: "interest",
      header: "Juros/Multa",
      cell: ({ row }) => {
        const amount = Number(row.original.amount);
        const payValue = Number(row.original.payValue);
        const diff = payValue - amount;
        if (diff <= 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <span className="tabular-nums text-amber-600 dark:text-amber-400">
            {formatBRL(diff.toFixed(2))}
          </span>
        );
      },
    }),

    // 8. Status (sortable)
    columnHelper.accessor("status", {
      id: "status",
      header: "Status",
      cell: (info) => {
        const config = STATUS_CONFIG[info.getValue()] ?? {
          label: info.getValue(),
          variant: "outline" as const,
        };
        return <Badge variant={config.variant}>{config.label}</Badge>;
      },
      enableSorting: true,
    }),

    // 9. Tags (not sortable, hidden on mobile)
    columnHelper.accessor("tags", {
      id: "tags",
      header: "Tags",
      cell: (info) => {
        const tags = info.getValue();
        if (!tags || tags.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex gap-1 max-w-[220px] overflow-hidden">
            {tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs whitespace-nowrap">
                {TAG_LABELS[tag] ?? tag}
              </Badge>
            ))}
          </div>
        );
      },
      enableSorting: false,
    }),

    // 10. Ações — dynamic based on status + role (ADR-010)
    columnHelper.display({
      id: "actions",
      header: () => <span className="sr-only">Ações</span>,
      cell: (info) => {
        const payable = info.row.original;
        const actions = getAvailableActions(payable.status, userRole);

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Abrir menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actions.map((t) => (
                <DropdownMenuItem
                  key={t.action}
                  onClick={() =>
                    t.action === "pay"
                      ? onRequestPay(payable.id)
                      : onTransition(payable.id, t.action)
                  }
                >
                  {ACTION_ICONS[t.action]}
                  {t.label}
                </DropdownMenuItem>
              ))}
              {actions.length === 0 && (
                <DropdownMenuItem disabled>
                  Sem ações disponíveis
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    }),
  ];
}

// --- Responsive visibility classes per column ---
const COLUMN_CLASSES: Record<string, string> = {
  supplierDocument: "hidden lg:table-cell",
  interest: "hidden lg:table-cell",
  tags: "hidden lg:table-cell",
};

export function PayablesTable({
  payables,
  loading,
  sort,
  order,
  onSortChange,
  userRole,
  onTransition,
  onRequestPay,
}: PayablesTableProps) {
  // Build columns with callbacks — memoize via useMemo would be an option,
  // but since TanStack Table recreates on every render anyway, it's fine here.
  const columns = buildColumns(userRole, onTransition, onRequestPay);

  // Convert our sort/order props into TanStack's SortingState format
  const sorting: SortingState = [{ id: sort, desc: order === "desc" }];

  const table = useReactTable({
    data: payables,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    state: { sorting },
    enableSortingRemoval: false,
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

                return (
                  <TableHead
                    key={header.id}
                    className={`${cellClass} ${
                      header.id === "amount" || header.id === "payValue" || header.id === "interest"
                        ? "text-right"
                        : ""
                    }`}
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
                <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-36" /></TableCell>
                <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-24" /></TableCell>
                <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-24" /></TableCell>
                <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-20" /></TableCell>
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
                Nenhum título encontrado.
              </TableCell>
            </TableRow>
          )}

          {/* Data rows */}
          {!loading &&
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const cellClass = COLUMN_CLASSES[cell.column.id] ?? "";
                  return (
                    <TableCell
                      key={cell.id}
                      className={`${cellClass} ${
                        cell.column.id === "amount" ||
                        cell.column.id === "payValue" ||
                        cell.column.id === "interest"
                          ? "text-right"
                          : ""
                      }`}
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
