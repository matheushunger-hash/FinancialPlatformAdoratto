"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import type { RowSelectionState } from "@tanstack/react-table";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BatchActionBar } from "@/components/payables/batch-action-bar";
import { PayablesTable } from "@/components/payables/payables-table";
import { PayablesFilters } from "@/components/payables/payables-filters";
import { PayablesPagination } from "@/components/payables/payables-pagination";
import { PayableSheet } from "@/components/payables/payable-sheet";
import { ForceStatusDialog } from "@/components/payables/force-status-dialog";
import { PayablePayDialog } from "@/components/payables/payable-pay-dialog";
import { exportPayablesToCSV } from "@/lib/payables/export-csv";
import { SupplierInfoCard } from "@/components/suppliers/supplier-info-card";
import { SupplierKPICards } from "@/components/suppliers/supplier-kpi-cards";
import { SupplierSheet } from "@/components/suppliers/supplier-sheet";
import type {
  BatchTransitionResponse,
  PayableFilters,
  PayableListItem,
  PayablesListResponse,
} from "@/lib/payables/types";
import type {
  SupplierDetailResponse,
  SupplierListItem,
  SupplierSummary,
} from "@/lib/suppliers/types";

// =============================================================================
// SupplierDetailView — Orchestrator for the supplier detail page (ADR-017)
// =============================================================================
// Two independent fetches:
//   1. Supplier info + KPI summary → GET /api/suppliers/{id}?include=summary
//   2. Payables list (filtered by supplierId) → GET /api/payables?supplierId={id}
//
// After payable transitions, BOTH fetches re-run so KPIs stay in sync.
// Follows the same pattern as PayablesView (src/components/payables/payables-view.tsx).
// =============================================================================

interface SupplierDetailViewProps {
  supplierId: string;
  userRole: string;
}

export function SupplierDetailView({ supplierId, userRole }: SupplierDetailViewProps) {
  // --- Supplier state ---
  const [supplier, setSupplier] = useState<SupplierListItem | null>(null);
  const [summary, setSummary] = useState<SupplierSummary | null>(null);
  const [supplierLoading, setSupplierLoading] = useState(true);
  const [supplierSheetOpen, setSupplierSheetOpen] = useState(false);

  // --- Payables state (same as PayablesView) ---
  const [payables, setPayables] = useState<PayableListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingPayableId, setEditingPayableId] = useState<string | null>(null);
  const [payingPayableId, setPayingPayableId] = useState<string | null>(null);
  const [forceStatusPayableId, setForceStatusPayableId] = useState<string | null>(null);
  const [deletingPayableId, setDeletingPayableId] = useState<string | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [batchAction, setBatchAction] = useState<"approve" | "pay" | null>(null);
  const [sort, setSort] = useState("dueDate");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [filters, setFilters] = useState<PayableFilters>({});

  // --- Debounced search (300ms) ---
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

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

  // --- Fetch 1: Supplier info + summary ---
  const fetchSupplier = useCallback(async () => {
    setSupplierLoading(true);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}?include=summary`);
      if (!res.ok) throw new Error("Erro ao carregar fornecedor");
      const data: SupplierDetailResponse = await res.json();
      setSupplier(data);
      setSummary(data.summary ?? null);
    } catch {
      toast.error("Erro ao carregar fornecedor");
    } finally {
      setSupplierLoading(false);
    }
  }, [supplierId]);

  // --- Fetch 2: Payables for this supplier ---
  const fetchPayables = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "25",
        sort,
        order,
        supplierId,
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (filters.status) params.set("status", filters.status);
      if (filters.tag) params.set("tag", filters.tag);
      if (filters.category) params.set("category", filters.category);
      if (filters.paymentMethod) params.set("paymentMethod", filters.paymentMethod);
      if (filters.dueDateFrom) params.set("dueDateFrom", filters.dueDateFrom);
      if (filters.dueDateTo) params.set("dueDateTo", filters.dueDateTo);

      const res = await fetch(`/api/payables?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar títulos");

      const data: PayablesListResponse = await res.json();
      setPayables(data.payables);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setRowSelection({});
    } catch {
      toast.error("Erro ao carregar títulos");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, sort, order, filters, supplierId]);

  // Run both fetches on mount
  useEffect(() => {
    fetchSupplier();
  }, [fetchSupplier]);

  useEffect(() => {
    fetchPayables();
  }, [fetchPayables]);

  // --- Handlers ---

  function handleNew() {
    setEditingPayableId(null);
    setSheetOpen(true);
  }

  function handleEdit(id: string) {
    setEditingPayableId(id);
    setSheetOpen(true);
  }

  // After any payable create/edit, refresh BOTH fetches (KPIs may change)
  function handlePayableSuccess() {
    setEditingPayableId(null);
    setSheetOpen(false);
    fetchPayables();
    fetchSupplier();
  }

  // After supplier edit, refresh supplier data
  function handleSupplierSuccess() {
    setSupplierSheetOpen(false);
    fetchSupplier();
  }

  function handleFiltersChange(newFilters: PayableFilters) {
    setFilters(newFilters);
    setPage(1);
  }

  function handleSortChange(columnId: string) {
    if (columnId === sort) {
      setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSort(columnId);
      setOrder(columnId === "dueDate" ? "desc" : "asc");
    }
    setPage(1);
  }

  async function handleTransition(payableId: string, action: string, paidAt?: string) {
    try {
      const res = await fetch(`/api/payables/${payableId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, paidAt }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao atualizar status");
      }
      toast.success("Status atualizado com sucesso");
      fetchPayables();
      fetchSupplier(); // KPIs may change after transition
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar status");
    }
  }

  async function handleForceStatus(targetStatus: string, paidAt?: string) {
    if (!forceStatusPayableId) return;
    try {
      const res = await fetch(`/api/payables/${forceStatusPayableId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "force-status", targetStatus, paidAt }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao alterar status");
      }
      toast.success("Status atualizado com sucesso");
      setForceStatusPayableId(null);
      fetchPayables();
      fetchSupplier();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar status");
    }
  }

  async function handleDelete() {
    if (!deletingPayableId) return;
    try {
      const res = await fetch(`/api/payables/${deletingPayableId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao excluir título");
      }
      toast.success("Título excluído com sucesso");
      setDeletingPayableId(null);
      fetchPayables();
      fetchSupplier(); // KPIs may change after deletion
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao excluir título",
      );
    }
  }

  const forceStatusCurrentStatus = forceStatusPayableId
    ? payables.find((p) => p.id === forceStatusPayableId)?.status ?? ""
    : "";

  // --- Batch actions ---
  const selectedPayables = useMemo(() => {
    return Object.keys(rowSelection)
      .filter((key) => rowSelection[key])
      .map((key) => payables[Number(key)])
      .filter(Boolean);
  }, [rowSelection, payables]);

  const selectedTotal = useMemo(() => {
    return selectedPayables.reduce((sum, p) => sum + Number(p.payValue), 0);
  }, [selectedPayables]);

  const eligibleForApprove = selectedPayables.filter((p) => p.status === "PENDING");
  const eligibleForPay = selectedPayables.filter(
    (p) => p.status === "PENDING" || p.status === "APPROVED",
  );

  async function handleBatchTransition(action: string, paidAt?: string) {
    const eligible = action === "approve" ? eligibleForApprove : eligibleForPay;
    const ids = eligible.map((p) => p.id);
    if (ids.length === 0) return;

    try {
      const res = await fetch("/api/payables/batch-transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action, paidAt }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao processar lote");
      }
      const result: BatchTransitionResponse = await res.json();
      if (result.failed.length === 0) {
        toast.success(`${result.succeeded.length} título(s) atualizado(s) com sucesso`);
      } else {
        toast.warning(
          `${result.succeeded.length} atualizado(s), ${result.failed.length} com erro`,
        );
      }
      setRowSelection({});
      fetchPayables();
      fetchSupplier();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao processar lote");
    }
  }

  function handleBatchExportCSV() {
    exportPayablesToCSV(selectedPayables);
  }

  // --- Render ---
  return (
    <div className="space-y-6">
      {/* Supplier info card */}
      <SupplierInfoCard
        supplier={supplier}
        loading={supplierLoading}
        onEdit={() => setSupplierSheetOpen(true)}
      />

      {/* KPI summary cards */}
      <SupplierKPICards summary={summary} loading={supplierLoading} />

      {/* Payables section */}
      <div className="space-y-4">
        {/* Section header + search + new button */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Títulos a Pagar</h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="Buscar descrição, NF..."
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
        </div>

        {/* Filters */}
        <PayablesFilters
          filters={filters}
          onFiltersChange={handleFiltersChange}
        />

        {/* Table — supplier columns hidden since we're already on the supplier page */}
        <PayablesTable
          payables={payables}
          loading={loading}
          sort={sort}
          order={order}
          onSortChange={handleSortChange}
          userRole={userRole}
          onTransition={handleTransition}
          onRequestPay={(id) => setPayingPayableId(id)}
          onEdit={handleEdit}
          onRequestForceStatus={(id) => setForceStatusPayableId(id)}
          onDelete={(id) => setDeletingPayableId(id)}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          hideSupplierColumns
        />

        {/* Pagination */}
        <PayablesPagination
          page={page}
          totalPages={totalPages}
          total={total}
          currentCount={payables.length}
          onPageChange={setPage}
        />
      </div>

      {/* Supplier edit sheet */}
      <SupplierSheet
        open={supplierSheetOpen}
        onOpenChange={setSupplierSheetOpen}
        supplier={supplier}
        onSuccess={handleSupplierSuccess}
      />

      {/* Payable create/edit sheet */}
      <PayableSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setEditingPayableId(null);
        }}
        onSuccess={handlePayableSuccess}
        payableId={editingPayableId}
      />

      {/* Force-status dialog */}
      <ForceStatusDialog
        open={forceStatusPayableId !== null}
        currentStatus={forceStatusCurrentStatus}
        onOpenChange={(open) => {
          if (!open) setForceStatusPayableId(null);
        }}
        onConfirm={(targetStatus, paidAt) => {
          handleForceStatus(targetStatus, paidAt);
        }}
      />

      {/* Payment date modal */}
      <PayablePayDialog
        open={payingPayableId !== null}
        onOpenChange={(open) => {
          if (!open) setPayingPayableId(null);
        }}
        onConfirm={(paidAt) => {
          handleTransition(payingPayableId!, "pay", paidAt);
          setPayingPayableId(null);
        }}
      />

      {/* Batch action bar */}
      <BatchActionBar
        selectedCount={selectedPayables.length}
        selectedTotal={selectedTotal}
        selectedPayables={selectedPayables}
        userRole={userRole}
        onApprove={() => setBatchAction("approve")}
        onPay={() => setBatchAction("pay")}
        onExport={handleBatchExportCSV}
        onClear={() => setRowSelection({})}
      />

      {/* Batch approve confirmation */}
      <AlertDialog
        open={batchAction === "approve"}
        onOpenChange={(open) => {
          if (!open) setBatchAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar títulos em lote</AlertDialogTitle>
            <AlertDialogDescription>
              {eligibleForApprove.length} de {selectedPayables.length}{" "}
              selecionado(s) podem ser aprovados (status Pendente).
              {eligibleForApprove.length > 0 && (
                <>
                  {" "}
                  Total: R${" "}
                  {eligibleForApprove
                    .reduce((s, p) => s + Number(p.payValue), 0)
                    .toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleBatchTransition("approve");
                setBatchAction(null);
              }}
              disabled={eligibleForApprove.length === 0}
            >
              Aprovar {eligibleForApprove.length} título(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch pay date picker */}
      <PayablePayDialog
        open={batchAction === "pay"}
        onOpenChange={(open) => {
          if (!open) setBatchAction(null);
        }}
        onConfirm={(paidAt) => {
          handleBatchTransition("pay", paidAt);
          setBatchAction(null);
        }}
      />

      {/* Delete confirmation dialog (#50) */}
      <AlertDialog
        open={deletingPayableId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingPayableId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir título</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este título? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
