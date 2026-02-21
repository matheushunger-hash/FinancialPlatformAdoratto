"use client";

import { MoreHorizontal, Pencil, Power } from "lucide-react";
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
import type { SupplierListItem } from "@/lib/suppliers/types";

// =============================================================================
// SuppliersTable — Displays the list of suppliers
// =============================================================================
// This is a "dumb" component — it receives data via props and calls callbacks
// when the user interacts. It doesn't know about fetch or state management.
//
// Three visual states:
//   1. Loading → shows skeleton rows
//   2. Empty → shows a message
//   3. Data → shows the supplier rows
// =============================================================================

interface SuppliersTableProps {
  suppliers: SupplierListItem[];
  loading: boolean;
  onEdit: (supplier: SupplierListItem) => void;
  onToggleActive: (supplier: SupplierListItem) => void;
}

function formatDocument(supplier: SupplierListItem): string {
  return supplier.documentType === "CNPJ"
    ? formatCNPJ(supplier.document)
    : formatCPF(supplier.document);
}

export function SuppliersTable({
  suppliers,
  loading,
  onEdit,
  onToggleActive,
}: SuppliersTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>CNPJ/CPF</TableHead>
            <TableHead className="hidden md:table-cell">Nome Fantasia</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Loading state: skeleton rows */}
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`skeleton-${i}`}>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
                <TableCell><Skeleton className="h-5 w-14" /></TableCell>
                <TableCell><Skeleton className="h-8 w-8" /></TableCell>
              </TableRow>
            ))}

          {/* Empty state */}
          {!loading && suppliers.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                Nenhum fornecedor encontrado.
              </TableCell>
            </TableRow>
          )}

          {/* Data rows */}
          {!loading &&
            suppliers.map((supplier) => (
              <TableRow key={supplier.id}>
                <TableCell className="font-medium">{supplier.name}</TableCell>
                <TableCell className="font-mono text-sm">
                  {formatDocument(supplier)}
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">
                  {supplier.tradeName || "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={supplier.active ? "default" : "secondary"}>
                    {supplier.active ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Abrir menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
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
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
}
