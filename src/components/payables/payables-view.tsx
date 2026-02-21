"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PayablesTable } from "@/components/payables/payables-table";
import { PayablesPagination } from "@/components/payables/payables-pagination";
import { PayableSheet } from "@/components/payables/payable-sheet";
import type {
  PayableListItem,
  PayablesListResponse,
} from "@/lib/payables/types";

// =============================================================================
// PayablesView — The orchestrator component for contas a pagar
// =============================================================================
// Same pattern as SuppliersView — owns all the state, passes data/callbacks
// down to child components. Adds sort state on top of the suppliers pattern.
//
// State: payables list, pagination, search (debounced), sort + order, sheet.
// =============================================================================

export function PayablesView() {
  const [payables, setPayables] = useState<PayableListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Sort state — default to dueDate descending (most urgent first)
  const [sort, setSort] = useState("dueDate");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

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

  // Fetch payables whenever page, search, sort, or order changes
  const fetchPayables = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "25",
        sort,
        order,
      });
      if (debouncedSearch) params.set("search", debouncedSearch);

      const res = await fetch(`/api/payables?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar títulos");

      const data: PayablesListResponse = await res.json();
      setPayables(data.payables);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      toast.error("Erro ao carregar títulos");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, sort, order]);

  useEffect(() => {
    fetchPayables();
  }, [fetchPayables]);

  // --- Handlers ---

  function handleNew() {
    setSheetOpen(true);
  }

  function handleSuccess() {
    setSheetOpen(false);
    fetchPayables();
  }

  function handleSortChange(columnId: string) {
    if (columnId === sort) {
      // Same column — toggle direction
      setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      // New column — default to asc, except dueDate defaults to desc
      setSort(columnId);
      setOrder(columnId === "dueDate" ? "desc" : "asc");
    }
    setPage(1); // Reset to page 1 when sort changes
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: search + new button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Buscar por descrição, fornecedor ou NF..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={handleNew}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Título
        </Button>
      </div>

      {/* Table */}
      <PayablesTable
        payables={payables}
        loading={loading}
        sort={sort}
        order={order}
        onSortChange={handleSortChange}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <PayablesPagination
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
        />
      )}

      {/* Side sheet (create form) */}
      <PayableSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
