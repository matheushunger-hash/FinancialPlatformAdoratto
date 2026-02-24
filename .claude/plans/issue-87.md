# Plan: KPI Cards — Clickable Drill-Down (#87)

## Context
The dashboard has 6 KPI cards (e.g., "337 vencidos — R$ 1.1M") that are currently static text. Users see a compelling summary but can't explore the underlying payables without manually navigating and applying filters. All surrounding charts (stacked bars, weekly calendar, aging brackets, top suppliers) are already clickable — the KPI cards are the last non-interactive element.

## Approach
Follow the **exact same pattern** already established by the charts: each clickable element builds a `DrillDownFilter` object and calls `onDrillDown(filter)`, which the orchestrator passes to the `DrillDownSheet`.

Two small plumbing changes are needed first:
1. **Multi-status support in the payables API** — currently `status` accepts only one value (e.g., `PENDING`). Two of the six KPI cards need `PENDING + APPROVED` (the "active" statuses). We'll support comma-separated values like `status=PENDING,APPROVED` — fully backward compatible.
2. **Tag field in DrillDownFilter** — the "Segurado no Período" card needs to filter by the `segurado` tag. The payables API already supports `?tag=segurado`, but the DrillDownFilter type and the drill-down sheet's URL builder don't pass it through yet.

After that, the actual feature is straightforward: add `onDrillDown` + period props to KPICards, build a filter for each card, add hover styles.

**5 files changed, 0 new files, 0 new dependencies.**

## Steps

### 1. Add `tag` field to `DrillDownFilter`
**File:** `src/lib/dashboard/types.ts`
- Add `tag?: string` to the `DrillDownFilter` interface (after `overdue`)
- This is the "contract" between card click handlers and the Sheet — the Sheet needs to know how to pass it to the API

### 2. Support comma-separated statuses in the payables API
**File:** `src/app/api/payables/route.ts`
- Current code (lines 82-84):
  ```typescript
  const statusParam = searchParams.get("status") || "";
  if (VALID_STATUSES.includes(statusParam)) {
    conditions.push({ status: statusParam });
  }
  ```
- Replace with:
  ```typescript
  const statusParam = searchParams.get("status") || "";
  const statuses = statusParam.split(",").filter(s => VALID_STATUSES.includes(s));
  if (statuses.length === 1) {
    conditions.push({ status: statuses[0] });
  } else if (statuses.length > 1) {
    conditions.push({ status: { in: statuses } });
  }
  ```
- **Why:** "Total a Pagar" and "A Vencer no Período" both need `status=PENDING,APPROVED`. This is backward compatible — single values still work exactly as before. The `in` operator is standard Prisma.

### 3. Wire `tag` through the drill-down sheet
**File:** `src/components/dashboard/drill-down-sheet.tsx`
- In the **fetch URL builder** (around line 137-138), add:
  ```typescript
  if (filter.tag) params.set("tag", filter.tag);
  ```
- In the **`buildPayablesUrl` function** (around line 66-68), add:
  ```typescript
  if (filter.tag) params.set("tag", filter.tag);
  ```
- Both places already handle `supplierId`, `status`, and `overdue` — adding `tag` follows the same pattern.

### 4. Add drill-down props and click handling to KPI cards
**File:** `src/components/dashboard/kpi-cards.tsx`

**4a. Extend `CardConfig` with a filter builder:**
```typescript
interface CardConfig {
  key: keyof DashboardKPIs;
  icon: LucideIcon;
  buildFilter: (from: string, to: string) => DrillDownFilter;
}
```

Each card's `buildFilter` captures the specific filters from the issue requirements:

| Card key | title | Filter params |
|---|---|---|
| `totalPayable` | "Total a Pagar" | `status: "PENDING,APPROVED"`, `dueDateFrom: from`, `dueDateTo: to` |
| `overdue` | "Vencidos" | `overdue: true`, `dueDateFrom: "2020-01-01"`, `dueDateTo: today` |
| `dueSoon` | "A Vencer — Próximos 7 Dias" | `dueDateFrom: today`, `dueDateTo: today + 7 days` |
| `paidThisMonth` | "Pagos no Período" | `status: "PAID"`, `dueDateFrom: from`, `dueDateTo: to` |
| `dueInPeriod` | "A Vencer no Período" | `status: "PENDING,APPROVED"`, `dueDateFrom: from`, `dueDateTo: to` |
| `insuredInPeriod` | "Segurado no Período" | `tag: "segurado"`, `dueDateFrom: from`, `dueDateTo: to` |

**Note on "Total a Pagar" and "Overdue":** These are "snapshot" KPIs (always-live, not period-scoped). Their `from`/`to` won't come from the period selector — we'll handle this with sensible defaults:
- `totalPayable`: uses the period range passed from the orchestrator (these are the active payables in the period)
- `overdue`: uses a fixed wide range (`2020-01-01` to today) plus `overdue: true`, since all overdue payables are relevant regardless of period
- `dueSoon`: computes `today` and `today + 7 days` dynamically

**4b. Extend `KPICardsProps`:**
```typescript
interface KPICardsProps {
  data: DashboardKPIs | null;
  loading: boolean;
  error: string | null;
  keys?: (keyof DashboardKPIs)[];
  from?: string;  // NEW — period start (for filter builders)
  to?: string;    // NEW — period end (for filter builders)
  onDrillDown?: (filter: DrillDownFilter) => void; // NEW — drill-down callback
}
```

**4c. Add hover styles to `<Card>`:**
```typescript
<Card
  key={config.key}
  className={cn(
    "rounded-xl shadow-sm",
    onDrillDown && "cursor-pointer transition-all hover:shadow-md hover:scale-[1.02]"
  )}
  onClick={() => {
    if (!onDrillDown || !from || !to) return;
    onDrillDown(config.buildFilter(from, to));
  }}
>
```
- Hover effect only appears when `onDrillDown` is provided (so the component remains usable without drill-down)
- Subtle scale + shadow transition — matches the interactivity established by the charts

### 5. Wire KPICards to the orchestrator
**File:** `src/components/dashboard/dashboard-view.tsx`

- **First KPICards** (snapshot, line 84-89) — add `onDrillDown` and `from`/`to`:
  ```typescript
  <KPICards
    data={data}
    loading={loading}
    error={error}
    keys={["totalPayable", "overdue", "dueSoon"]}
    from={from}
    to={to}
    onDrillDown={setDrillDown}
  />
  ```

- **Second KPICards** (period-filtered, line 118-123) — same treatment:
  ```typescript
  <KPICards
    data={data}
    loading={loading}
    error={error}
    keys={["paidThisMonth", "dueInPeriod", "insuredInPeriod"]}
    from={from}
    to={to}
    onDrillDown={setDrillDown}
  />
  ```

## Files changed
| File | Change |
|---|---|
| `src/lib/dashboard/types.ts` | Add `tag?: string` to `DrillDownFilter` |
| `src/app/api/payables/route.ts` | Support comma-separated statuses (`status=PENDING,APPROVED`) |
| `src/components/dashboard/drill-down-sheet.tsx` | Pass `tag` through to fetch URL and "Ver todos" link |
| `src/components/dashboard/kpi-cards.tsx` | Add `onDrillDown`/`from`/`to` props, `buildFilter` per card, hover styles |
| `src/components/dashboard/dashboard-view.tsx` | Pass `onDrillDown={setDrillDown}` and `from`/`to` to both KPICards |

## Verification
1. `npx tsc --noEmit` — zero TypeScript errors
2. Click each KPI card → drill-down sheet opens with correct title and matching payables:
   - "Total a Pagar" → shows PENDING + APPROVED payables in the period
   - "Vencidos" → shows overdue payables (red badges, dias vencidos column)
   - "A Vencer 7 dias" → shows payables due in the next 7 days
   - "Pagos no Período" → shows PAID payables in the period
   - "A Vencer no Período" → shows PENDING + APPROVED in the period
   - "Segurado no Período" → shows payables tagged "segurado" in the period
3. Hover effect visible: cursor changes to pointer, card subtly scales up with shadow
4. "Ver todos" link in drill-down sheet navigates to `/contas-a-pagar` with correct URL params
5. Closing the drill-down sheet (X or click outside) resets state — clicking another card opens a fresh sheet
6. Existing chart drill-downs still work (no regression)
