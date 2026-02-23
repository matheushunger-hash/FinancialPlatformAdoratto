"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecurringTable } from "@/components/recurring/recurring-table";
import { RecurringSheet } from "@/components/recurring/recurring-sheet";
import type {
  RecurringListItem,
  RecurringListResponse,
} from "@/lib/recurring/types";

// =============================================================================
// RecurringView — Orchestrator for recurring payable templates
// =============================================================================

interface RecurringViewProps {
  userRole: string;
}

export function RecurringView({ userRole }: RecurringViewProps) {
  const [items, setItems] = useState<RecurringListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Search with debounce
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sort
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  // Quick filter: all / active / inactive
  const [activeFilter, setActiveFilter] = useState<
    "all" | "active" | "inactive"
  >("all");

  // Sheet (create/edit)
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Debounce search by 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Fetch data
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        sort,
        order,
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (activeFilter === "active") params.set("active", "true");
      if (activeFilter === "inactive") params.set("active", "false");

      const res = await fetch(`/api/recurring?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar recorrências");

      const data: RecurringListResponse = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      toast.error("Erro ao carregar recorrências");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, sort, order, activeFilter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // --- Handlers ---

  function handleNew() {
    setEditingId(null);
    setSheetOpen(true);
  }

  function handleEdit(id: string) {
    setEditingId(id);
    setSheetOpen(true);
  }

  function handleSuccess() {
    setEditingId(null);
    setSheetOpen(false);
    fetchItems();
  }

  function handleSortChange(column: string) {
    if (column === sort) {
      setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSort(column);
      setOrder("asc");
    }
    setPage(1);
  }

  async function handleToggleActive(id: string, currentActive: boolean) {
    // Find the item to get its current data for the PATCH
    const item = items.find((i) => i.id === id);
    if (!item) return;

    try {
      const res = await fetch(`/api/recurring/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: item.supplierId,
          description: item.description,
          category: item.category,
          amount: item.amount,
          paymentMethod: item.paymentMethod,
          frequency: item.frequency,
          dayOfMonth: item.dayOfMonth?.toString() ?? "",
          startDate: item.startDate.split("T")[0],
          endDate: item.endDate ? item.endDate.split("T")[0] : "",
          tags: item.tags,
          notes: item.notes ?? "",
          active: !currentActive,
        }),
      });

      if (!res.ok) throw new Error("Erro ao atualizar");

      // Optimistic update
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, active: !currentActive } : i,
        ),
      );
      toast.success(currentActive ? "Recorrência desativada" : "Recorrência ativada");
    } catch {
      toast.error("Erro ao atualizar recorrência");
      fetchItems(); // Revert on error
    }
  }

  async function handleDelete() {
    if (!deletingId) return;

    try {
      const res = await fetch(`/api/recurring/${deletingId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao excluir");
      }

      toast.success("Recorrência excluída");
      setDeletingId(null);
      fetchItems();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao excluir recorrência",
      );
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: search + quick filters + new button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por fornecedor ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={handleNew}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Recorrência
        </Button>
      </div>

      {/* Quick filter pills */}
      <div className="flex gap-2">
        {(
          [
            { key: "all", label: "Todos" },
            { key: "active", label: "Ativos" },
            { key: "inactive", label: "Inativos" },
          ] as const
        ).map((pill) => (
          <Badge
            key={pill.key}
            variant={activeFilter === pill.key ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => {
              setActiveFilter(pill.key);
              setPage(1);
            }}
          >
            {pill.label}
          </Badge>
        ))}
      </div>

      {/* Table */}
      <RecurringTable
        items={items}
        loading={loading}
        sort={sort}
        order={order}
        onSortChange={handleSortChange}
        onEdit={handleEdit}
        onDelete={(id) => setDeletingId(id)}
        onToggleActive={handleToggleActive}
        userRole={userRole}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} recorrência{total !== 1 ? "s" : ""} encontrada{total !== 1 ? "s" : ""}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <span className="flex items-center px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      {/* Sheet (create/edit form) */}
      <RecurringSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editingId={editingId}
        onSuccess={handleSuccess}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deletingId}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir recorrência?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O template será removido
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
