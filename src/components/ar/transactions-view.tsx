"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { TransactionsTable } from "@/components/ar/transactions-table";
import { TransactionsFilters } from "@/components/ar/transactions-filters";
import { TransactionsPagination } from "@/components/ar/transactions-pagination";
import { ReceiptRegistrationDialog } from "@/components/ar/receipt-registration-dialog";
import type {
  CardTransactionListItem,
  TransactionsListResponse,
  TransactionFilters,
} from "@/lib/ar/types";

// =============================================================================
// TransactionsView — Orchestrator for the AR transactions page
// =============================================================================
// Same pattern as PayablesView — owns all state, passes data/callbacks to
// child components. Simplified: no batch actions, no edit sheet, no transitions.
// =============================================================================

interface TransactionsViewProps {
  userRole: string;
}

// --- Helper: Format currency in BRL (for summary bar) ---
function formatBRL(value: string): string {
  const num = Number(value);
  if (isNaN(num)) return value;
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TransactionsView({ userRole: _userRole }: TransactionsViewProps) {
  const [transactions, setTransactions] = useState<CardTransactionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Sort state — default to expectedPaymentDate descending (upcoming first)
  const [sort, setSort] = useState("expectedPaymentDate");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  // Filter state
  const [filters, setFilters] = useState<TransactionFilters>({});

  // Summary totals from the API response
  const [grossTotal, setGrossTotal] = useState("0");
  const [netTotal, setNetTotal] = useState("0");

  // Receipt registration dialog state (#71)
  const [registeringTxId, setRegisteringTxId] = useState<string | null>(null);

  // Debounce search input by 300ms
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

  // Fetch transactions whenever page, search, sort, order, or filters change
  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "25",
        sort,
        order,
      });
      if (debouncedSearch) params.set("search", debouncedSearch);

      // Append active filter params
      if (filters.status) params.set("status", filters.status);
      if (filters.brand) params.set("brand", filters.brand);
      if (filters.acquirer) params.set("acquirer", filters.acquirer);
      if (filters.dateFrom) params.set("from", filters.dateFrom);
      if (filters.dateTo) params.set("to", filters.dateTo);

      const res = await fetch(`/api/ar/transactions?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar transações");

      const data: TransactionsListResponse = await res.json();
      setTransactions(data.transactions);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setGrossTotal(data.grossTotal);
      setNetTotal(data.netTotal);
    } catch {
      toast.error("Erro ao carregar transações");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, sort, order, filters]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // --- Handlers ---

  function handleSortChange(columnId: string) {
    if (columnId === sort) {
      // Same column — toggle direction
      setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      // New column — default to asc, except dates default to desc
      setSort(columnId);
      setOrder(columnId === "expectedPaymentDate" ? "desc" : "asc");
    }
    setPage(1);
  }

  function handleFiltersChange(newFilters: TransactionFilters) {
    setFilters(newFilters);
    setPage(1);
  }

  // Receipt registration handler — POST to API, refresh on success
  async function handleRegisterReceipt(data: {
    transactionId: string;
    receivedAt: string;
    receivedAmount: string;
    notes: string;
  }) {
    try {
      const res = await fetch("/api/ar/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        toast.error(err.error || "Erro ao registrar recebimento");
        return;
      }

      const result = await res.json();
      const statusLabel = result.receipt.newStatus === "CONFIRMED" ? "Confirmado" : "Divergente";
      toast.success("Recebimento registrado", {
        description: `Status atualizado para ${statusLabel}`,
      });

      setRegisteringTxId(null);
      fetchTransactions();
    } catch {
      toast.error("Erro ao registrar recebimento");
    }
  }

  // Find the transaction being registered for the dialog props
  const registeringTransaction = registeringTxId
    ? transactions.find((t) => t.id === registeringTxId) ?? null
    : null;

  return (
    <div className="space-y-4">
      {/* Summary bar: gross/net totals for current filter */}
      {!loading && total > 0 && (
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span>
            Valor Bruto Total:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {formatBRL(grossTotal)}
            </span>
          </span>
          <span>
            Valor Líquido Total:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {formatBRL(netTotal)}
            </span>
          </span>
        </div>
      )}

      {/* Toolbar: search input */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Buscar por ID, bandeira, adquirente, NSU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Filters: quick pills + advanced dropdowns + date range */}
      <TransactionsFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />

      {/* Table */}
      <TransactionsTable
        transactions={transactions}
        loading={loading}
        sort={sort}
        order={order}
        onSortChange={handleSortChange}
        onRequestReceipt={(id) => setRegisteringTxId(id)}
      />

      {/* Pagination */}
      <TransactionsPagination
        page={page}
        totalPages={totalPages}
        total={total}
        currentCount={transactions.length}
        onPageChange={setPage}
      />

      {/* Receipt registration dialog (#71) */}
      <ReceiptRegistrationDialog
        open={registeringTxId !== null}
        onOpenChange={(open) => { if (!open) setRegisteringTxId(null); }}
        transaction={
          registeringTransaction
            ? {
                id: registeringTransaction.id,
                netAmount: registeringTransaction.netAmount,
                expectedPaymentDate: registeringTransaction.expectedPaymentDate,
              }
            : null
        }
        onConfirm={handleRegisterReceipt}
      />
    </div>
  );
}
