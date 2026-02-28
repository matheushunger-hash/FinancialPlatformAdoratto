"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Calendar, ExternalLink, FileSearch, Loader2, Search, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DISPLAY_STATUS_CONFIG } from "@/lib/payables/status";
import type { PayableListItem, PayablesListResponse } from "@/lib/payables/types";
import type { DrillDownFilter } from "@/lib/dashboard/types";

// =============================================================================
// DrillDownSheet — Displays filtered payables for a chart click (#47, #49)
// =============================================================================
// Opens when the user clicks a bar in the dashboard charts. Shows payables in
// a card-based layout with a summary bar, "load more" pagination, and a
// "Ver todos" link to navigate to the full payables page.
// =============================================================================

const PAGE_SIZE = 15;

// DisplayStatus → left border color. Complete class strings so Tailwind can detect them.
const STATUS_BORDER: Record<string, string> = {
  A_VENCER: "border-l-blue-800",
  VENCE_HOJE: "border-l-amber-500",
  VENCIDO: "border-l-red-500",
  APROVADO: "border-l-blue-500",
  SEGURADO: "border-l-purple-600",
  PAGO: "border-l-emerald-600",
  PROTESTADO: "border-l-red-900",
  CANCELADO: "border-l-gray-400",
};

// Sort options available in the drill-down panel (key must match API SORT_MAP)
const SORT_OPTIONS = [
  { key: "dueDate", label: "Vencimento" },
  { key: "payValue", label: "Valor" },
  { key: "supplierName", label: "Fornecedor" },
  { key: "status", label: "Status" },
] as const;

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Format "2026-02-15" → "15/02/2026"
function formatDate(isoDate: string): string {
  const parts = isoDate.split("T")[0].split("-");
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// Build the URL for "Ver todos" — navigates to /contas-a-pagar with filters
function buildPayablesUrl(filter: DrillDownFilter): string {
  const params = new URLSearchParams();
  if (filter.supplierId) params.set("supplierId", filter.supplierId);
  if (filter.displayStatus) params.set("displayStatus", filter.displayStatus);
  params.set("dueDateFrom", filter.dueDateFrom);
  params.set("dueDateTo", filter.dueDateTo);
  return `/dashboard/contas-a-pagar?${params.toString()}`;
}

interface DrillDownSheetProps {
  filter: DrillDownFilter | null; // null = closed
  onOpenChange: (open: boolean) => void;
}

export function DrillDownSheet({ filter, onOpenChange }: DrillDownSheetProps) {
  const router = useRouter();

  const [payables, setPayables] = useState<PayableListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search state — same debounce pattern as payables-view.tsx
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input by 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm]);

  // Sort state — default to dueDate ascending (soonest first)
  const [sortField, setSortField] = useState("dueDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  function handleSortChange(field: string) {
    if (field === sortField) {
      // Same field — toggle direction
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      // New field — default to asc, except dueDate defaults to desc
      setSortField(field);
      setSortOrder(field === "dueDate" ? "asc" : "asc");
    }
  }

  // Derived state
  const hasMore = payables.length < total;
  const totalValue = payables.reduce((sum, p) => sum + Number(p.payValue), 0);

  const fetchPayables = useCallback(
    async (pageToFetch: number, append: boolean) => {
      if (!filter) return;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const params = new URLSearchParams();
      if (filter.supplierId) params.set("supplierId", filter.supplierId);
      if (filter.displayStatus) params.set("displayStatus", filter.displayStatus);
      params.set("dueDateFrom", filter.dueDateFrom);
      params.set("dueDateTo", filter.dueDateTo);
      params.set("page", String(pageToFetch));
      params.set("pageSize", String(PAGE_SIZE));
      params.set("sort", sortField);
      params.set("order", sortOrder);
      if (debouncedSearch) params.set("search", debouncedSearch);

      try {
        const res = await fetch(`/api/payables?${params.toString()}`);
        if (!res.ok) throw new Error("Falha ao carregar títulos");
        const data: PayablesListResponse = await res.json();

        if (append) {
          setPayables((prev) => [...prev, ...data.payables]);
        } else {
          setPayables(data.payables);
        }
        setTotal(data.total);
        setPage(pageToFetch);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar títulos");
      } finally {
        if (append) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    [filter, debouncedSearch, sortField, sortOrder],
  );

  // Track whether filter actually changed vs. fetchPayables changing due to sort/search.
  // Without this ref, changing sort would trigger the reset (since fetchPayables is recreated),
  // which would clobber the user's sort choice — a dependency cycle bug.
  const prevFilterRef = useRef(filter);

  useEffect(() => {
    const isFilterChange = filter !== prevFilterRef.current;
    prevFilterRef.current = filter;

    // Only reset search/sort when the drill-down filter changes (new chart click or close)
    if (isFilterChange) {
      setSearchTerm("");
      setDebouncedSearch("");
      setSortField("dueDate");
      setSortOrder("asc");
    }

    if (!filter) {
      setPayables([]);
      setTotal(0);
      setPage(1);
      setError(null);
      return;
    }

    fetchPayables(1, false);
  }, [filter, fetchPayables]);

  function handleLoadMore() {
    fetchPayables(page + 1, true);
  }

  const isOpen = filter !== null;
  const isSupplierDrillDown = !!filter?.supplierId;
  const statusCfg = filter?.displayStatus ? DISPLAY_STATUS_CONFIG[filter.displayStatus] : null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{filter?.title ?? "Detalhamento"}</SheetTitle>
          <SheetDescription>
            {filter
              ? `${formatDate(filter.dueDateFrom)} – ${formatDate(filter.dueDateTo)}`
              : "Carregando..."}
          </SheetDescription>
        </SheetHeader>

        {/* Error state */}
        {error && (
          <div className="mx-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Summary + Search — stays fixed while cards scroll underneath */}
        {!loading && !error && (payables.length > 0 || debouncedSearch) && (
          <div className="space-y-3 border-b px-4 pb-4">
            {payables.length > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                <div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatBRL(totalValue)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {total} título{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}
                    {payables.length < total && (
                      <span> ({payables.length} carregados)</span>
                    )}
                  </p>
                </div>
                {statusCfg && (
                  <Badge variant={statusCfg.variant} className="text-sm">
                    {statusCfg.label}
                  </Badge>
                )}
              </div>
            )}
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="Buscar por fornecedor, descrição, NF..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {/* Sort pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">Ordenar:</span>
              {SORT_OPTIONS.map((opt) => {
                const isActive = sortField === opt.key;
                return (
                  <Button
                    key={opt.key}
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    className="h-7 gap-1 px-2.5 text-xs"
                    onClick={() => handleSortChange(opt.key)}
                  >
                    {opt.label}
                    {isActive && (
                      sortOrder === "asc"
                        ? <ArrowUp className="h-3 w-3" />
                        : <ArrowDown className="h-3 w-3" />
                    )}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {/* Scrollable content area — only this section scrolls */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-l-4 border-l-muted p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-5 w-40" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state with icon */}
          {!loading && !error && payables.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileSearch className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">
                {debouncedSearch
                  ? "Nenhum resultado para esta busca."
                  : "Nenhum título encontrado para este filtro."}
              </p>
            </div>
          )}

          {/* Card list */}
          {!loading && !error && payables.length > 0 && (
            <div className="space-y-2">
              {payables.map((p) => {
                const cfg = DISPLAY_STATUS_CONFIG[p.displayStatus];
                const isOverdue = p.daysOverdue != null && p.daysOverdue > 0;
                const borderColor = STATUS_BORDER[p.displayStatus] ?? "border-l-gray-300";
                const primaryText = isSupplierDrillDown
                  ? p.description
                  : (p.supplierName ?? p.payee ?? "—");
                const secondaryText =
                  !isSupplierDrillDown && p.description !== p.supplierName
                    ? p.description
                    : null;

                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/dashboard/contas-a-pagar?edit=${p.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/dashboard/contas-a-pagar?edit=${p.id}`);
                      }
                    }}
                    className={cn(
                      "cursor-pointer rounded-lg border border-l-4 bg-card p-4 transition-colors hover:bg-accent/50",
                      borderColor,
                    )}
                  >
                    {/* Row 1: name + amount + badge */}
                    <div className="flex items-center gap-3">
                      {isSupplierDrillDown || !p.supplierId ? (
                        <span className="min-w-0 flex-1 truncate font-medium" title={primaryText}>
                          {primaryText}
                        </span>
                      ) : (
                        <Link
                          href={`/dashboard/fornecedores/${p.supplierId}`}
                          className="min-w-0 flex-1 truncate font-medium hover:underline"
                          title={primaryText}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {primaryText}
                        </Link>
                      )}
                      <span className="shrink-0 text-base font-semibold tabular-nums">
                        {formatBRL(Number(p.payValue))}
                      </span>
                      <Badge variant={cfg?.variant ?? "outline"} className="shrink-0">
                        {cfg?.label ?? p.displayStatus}
                      </Badge>
                    </div>
                    {/* Row 2: secondary text + date + overdue pill */}
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                        {secondaryText ?? "\u00A0"}
                      </span>
                      <span className="shrink-0 flex items-center gap-1 text-sm text-muted-foreground whitespace-nowrap">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(p.dueDate)}
                      </span>
                      {isOverdue && (
                        <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive whitespace-nowrap">
                          {p.daysOverdue}d vencido
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Load more button */}
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Carregando...
                      </>
                    ) : (
                      `Carregar mais (${payables.length} de ${total})`
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with "Ver todos" link */}
        {!loading && !error && filter && total > 0 && (
          <>
            <Separator />
            <SheetFooter className="px-4 py-4">
              <Link
                href={buildPayablesUrl(filter)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Ver todos na tabela completa
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
