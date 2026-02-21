"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SuppliersTable } from "@/components/suppliers/suppliers-table";
import { SuppliersPagination } from "@/components/suppliers/suppliers-pagination";
import { SupplierSheet } from "@/components/suppliers/supplier-sheet";
import type {
  SupplierListItem,
  SuppliersListResponse,
} from "@/lib/suppliers/types";

// =============================================================================
// SuppliersView — The orchestrator component
// =============================================================================
// This component owns all the state for the suppliers page:
//   - The list of suppliers (fetched from the API)
//   - Pagination (current page)
//   - Search (debounced input)
//   - Sheet state (open/close, which supplier is being edited)
//
// It passes data and callbacks down to child components. This pattern is called
// "lifting state up" — the parent holds the state, children just display it.
// =============================================================================

export function SuppliersView() {
  const [suppliers, setSuppliers] = useState<SupplierListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierListItem | null>(null);

  // Debounce timer ref — we don't want to fetch on every keystroke
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce the search input by 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to page 1 when search changes
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Fetch suppliers whenever page or debounced search changes
  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "10",
      });
      if (debouncedSearch) params.set("search", debouncedSearch);

      const res = await fetch(`/api/suppliers?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar fornecedores");

      const data: SuppliersListResponse = await res.json();
      setSuppliers(data.suppliers);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      toast.error("Erro ao carregar fornecedores");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  // --- Handlers passed to child components ---

  function handleNew() {
    setEditingSupplier(null);
    setSheetOpen(true);
  }

  function handleEdit(supplier: SupplierListItem) {
    setEditingSupplier(supplier);
    setSheetOpen(true);
  }

  async function handleToggleActive(supplier: SupplierListItem) {
    const newActive = !supplier.active;
    const action = newActive ? "reativado" : "desativado";

    try {
      const res = await fetch(`/api/suppliers/${supplier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: newActive }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || `Erro ao ${newActive ? "reativar" : "desativar"} fornecedor`);
        return;
      }

      toast.success(`Fornecedor ${action} com sucesso`);
      fetchSuppliers();
    } catch {
      toast.error(`Erro ao ${newActive ? "reativar" : "desativar"} fornecedor`);
    }
  }

  function handleSuccess() {
    setSheetOpen(false);
    setEditingSupplier(null);
    fetchSuppliers();
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: search + new button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Buscar por nome, documento ou fantasia..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={handleNew}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Fornecedor
        </Button>
      </div>

      {/* Table */}
      <SuppliersTable
        suppliers={suppliers}
        loading={loading}
        onEdit={handleEdit}
        onToggleActive={handleToggleActive}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <SuppliersPagination
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
        />
      )}

      {/* Side sheet (create / edit form) */}
      <SupplierSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        supplier={editingSupplier}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
