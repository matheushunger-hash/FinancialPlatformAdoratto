# Session Log (Archive)

Full session history moved from CLAUDE.md on 2026-02-22.
These logs document what was built, lessons learned, and patterns established in each session.

---

### 2026-02-28 — Issue #101 Phase 4: Historical Import Script

**What was built:**
- CLI script `scripts/import-historical.ts` for bulk historical spreadsheet import
- Dry-run by default (preview status breakdown, create/update counts), `--execute` to write
- Reuses `parseImportDate`, `processImportDocument`, `normalizeName` from `src/lib/import/parsing.ts`
- Same business rules as web import: segurado detection + date swap, supplier dedup cache, update-vs-create, PAID guard, salary/tax patterns

**Files changed:** 2 files (+557/-1), 1 new
- `scripts/import-historical.ts` — new CLI script
- `package.json` — added `db:import-historical` npm script

**What went well:**
- Dry-run test on real spreadsheet: 897 rows, 0 errors, correct status breakdown (218 temporal, 303 HELD, 376 PAID)
- All 894 supplier lookups matched existing suppliers — no new suppliers needed (data already imported via web wizard)
- Pre-implementation analysis correctly identified that web import wizard already covered most of the issue, avoiding unnecessary duplication

**Mistakes caught:**
- None — clean execution from plan to implementation

**Patterns established:**
- CLI import script pattern: reuse parsing functions from `src/lib/import/parsing.ts`, implement DB logic directly via Prisma, dry-run with `--execute` flag
- Dry-run supplier handling: return fake `dry-run-*` IDs to accumulate stats without creating real records
- Script resolves tenant/user via `prisma.user.findFirst({ where: { role: "ADMIN" } })` — same as seed pattern

---

### 2026-02-28 — Issue #100 Phase 3: API Corrections

**What was built:**
- New rollover endpoint: `PATCH /api/payables/[id]/rollover` — updates only `scheduledDate`, writes before/after to AuditLog (first real usage of audit table)
- Future-date validation on `paidAt` across 3 locations (force-status, normal pay, batch pay)
- `scheduledDate` added to listing SORT_MAP — enables `?sort=scheduledDate&order=asc`
- Removed `reopen` from CANCELLED transitions — cancellation is now a terminal state

**Files changed:** 5 files (+325/-102), 1 new
- `src/app/api/payables/[id]/rollover/route.ts` — new PATCH endpoint with AuditLog
- `src/app/api/payables/[id]/transition/route.ts` — paidAt future validation (2 locations)
- `src/app/api/payables/batch-transition/route.ts` — paidAt future validation + remove reopen from VALID_ACTIONS
- `src/app/api/payables/route.ts` — scheduledDate in SORT_MAP
- `src/lib/payables/transitions.ts` — CANCELLED: [] (terminal state)

**What went well:**
- Analysis phase correctly identified 3 of 5 tasks were already done — saved significant rework
- Clean execution: `tsc --noEmit` passed first try
- Rollover endpoint followed existing transition route pattern exactly

**Mistakes caught:**
- Remembered to also remove `reopen` from batch transition's `VALID_ACTIONS` set — plan didn't explicitly mention this but it was necessary for consistency

**Patterns established:**
- AuditLog usage: `{ action: "rollover", entityType: "payable", entityId, before: { field: old }, after: { field: new, reason? } }`
- Future-date validation: `endOfToday.setHours(23, 59, 59, 999)` then compare — allows same-day payments, rejects tomorrow+
- Terminal state pattern: empty transitions array `[]` blocks normal workflow; force-status (ADMIN) still works as escape hatch
- Pre-implementation analysis: compare issue tasks against codebase before planning — avoid reimplementing what exists

---

### 2026-02-28 — Issue #99 Phase 2: Schema & Database Corrections

**What was built:**
- Added `overdueTrackedAt` (`@db.Date`) to Payable model — fixes live bug where import route was writing to a non-existent column
- Added `markedPaidAt` (`@db.Timestamptz`) to Payable model — server audit timestamp for when "pay" action was executed
- Added doc comments to `dueDate` (immutable) and `scheduledDate` (mutable work queue) in schema
- Set/clear `markedPaidAt` in all 3 routes: single transition, batch transition, import
- Import PAID guard: `existingIsPaid` check prevents re-imports from downgrading PAID records (linter-added refinement)
- Exposed both fields in detail API (`GET /api/payables/[id]`)
- Display "Registrado [relative time]" in payable form metadata panel

**Files changed:** 7 files, +365/-272 lines
- `prisma/schema.prisma` — two new fields + doc comments
- `src/lib/payables/types.ts` — `PayableDetail` interface updated
- `src/app/api/payables/[id]/transition/route.ts` — `markedPaidAt` on pay/force-PAID/reverse/clear
- `src/app/api/payables/batch-transition/route.ts` — `markedPaidAt` on pay/reverse
- `src/app/api/import/route.ts` — `markedPaidAt` alongside `paidAt`, PAID guard
- `src/app/api/payables/[id]/route.ts` — expose both new fields in response
- `src/components/payables/payable-form.tsx` — "Registrado em" display

**What went well:**
- Clean execution — plan was specific enough to implement all 7 files without any errors
- `tsc --noEmit` passed on first try, zero issues
- `prisma db push` applied cleanly (nullable fields = no data loss risk)

**Mistakes caught:**
- Linter/user refined the import route to add PAID guard: when an existing record is already PAID, use `undefined` (Prisma skip) instead of overwriting with import data. This prevents re-imports from accidentally clearing payment status.

**Patterns established:**
- Audit timestamp pattern: separate user-entered date (`paidAt` with noon trick) from server action timestamp (`markedPaidAt` with `new Date()`). Always clear both together on reverse.
- Import PAID guard: `existing.actionStatus === "PAID"` → use `undefined` to skip overwriting status/payment fields. Reversing payment should only happen through UI transitions.
- `overdueTrackedAt` uses `.toISOString()?.split("T")[0]` in API response — date-only field returns date-only string

---

### 2026-02-24 — Issue #91: Buyer Budget Gauge — Overdue Awareness — CLOSED

**What was built:**
- Split the budget gauge progress bar into two segments: pending (green/yellow) + overdue (red)
- Replaced single PENDING-only budget query with two non-overlapping queries using `status IN (PENDING, APPROVED)` — one for non-overdue (dueDate >= today) and one for overdue (dueDate < today)
- Status logic change: overdue > 0 forces minimum "yellow" tier — buyers never see "green" while sitting on overdue debt
- Summary text shows "(R$ 20k vencido)" parenthetical when overdue exists (hidden when over budget — redundant)
- Count text split into "X pendentes, Y vencidos" with red coloring on overdue portion

**Files changed:** 3 files, +71/-19 lines
- `src/lib/dashboard/types.ts` — added `overdueOpen`, `overdueCount` to `BuyerBudgetData`
- `src/app/api/dashboard/route.ts` — two non-overlapping queries (16a pending, 16b overdue), `rawStatus` + overdue bump logic
- `src/components/dashboard/buyer-budget-gauge.tsx` — split bar with proportional widths, conditional border radius, overdue text

**Mistakes caught:**
1. No new mistakes — plan was specific enough to implement without issues

**Patterns established:**
- Non-overlapping query split: `dueDate >= today` vs `dueDate < today` within the same week range — avoids double-counting when extracting overdue from a broader "active" bucket
- Proportional segment widths: `(segment / total) * fillPercent` — scales correctly both under and over budget
- Conditional border radius for segmented bars: first segment `rounded-l-full`, last segment `rounded-r-full`, single segment gets both
- Status floor pattern: compute `rawStatus` from thresholds first, then conditionally bump: `rawStatus === "green" && condition ? "yellow" : rawStatus`
- Overdue text suppression: hide overdue callout when `isOver` — the "Excedido" message already conveys urgency

---

### 2026-02-24 — Issue #89: Daily Payments Chart — Summary Ribbon + Today Marker — CLOSED

**What was built:**
- Summary ribbon above the Daily Payments stacked bar chart showing period total and top 3 status subtotals with color-coded compact values (e.g., "R$ 120,5k total · R$ 80k pendente · R$ 25k pago")
- Dashed "Hoje" vertical reference line at today's date, only visible when today has data in the chart
- Enhanced tooltip with bold day total and `border-white/20` separator above the per-status breakdown
- New `formatRibbonBRL()` helper for compact currency with R$ prefix (separate from axis `formatCompactBRL`)

**Files changed:** 1 file, +81 lines
- `src/components/dashboard/dashboard-charts.tsx` — `ReferenceLine` import, `formatRibbonBRL` helper, enhanced tooltip, computed ribbon data, summary ribbon JSX, conditional today marker

**Mistakes caught:**
1. No new mistakes — plan was specific enough to implement without issues

**Patterns established:**
- Summary ribbon recipe (client-side): compute `periodTotal` + `statusTotals` (top N) from chart data array → render `flex-wrap text-xs` with mid-dot separators and color-coded status values
- `formatRibbonBRL()`: compact currency with R$ prefix — `R$ 120,5k` / `R$ 1,2M` — separate from axis `formatCompactBRL()` to avoid coupling
- Recharts `<ReferenceLine x={todayStr}>` on categorical axis: only renders when the value exists as a data point — check with `data.some(d => d.date === todayStr)`
- Tooltip day total: `payload.reduce((sum, p) => sum + (p.value || 0), 0)` sums all statuses, shown as bold line with `border-b border-white/20` separator
- Fragment wrapper `<>...</>` when adding sibling elements (ribbon + chart) inside a ternary branch

---

### 2026-02-24 — Issue #87: KPI Cards — Clickable Drill-Down — CLOSED

**What was built:**
Made all 6 KPI cards clickable — each opens the drill-down sheet with appropriate filters pre-applied. Added `tag` field to `DrillDownFilter`, comma-separated multi-status support in the payables API (`status=PENDING,APPROVED`), and subtle hover effects (scale + shadow) on cards.

**What went well:**
- Clean 5-file implementation, zero deviations from plan, zero TypeScript errors
- Reused the exact same `DrillDownFilter` + `onDrillDown` pattern already established by charts
- Comma-separated status support is backward compatible — single values still work
- `buildFilter` per card is declarative and data-driven — no switch/if chains

**Mistakes caught:**
- None — plan was specific enough to implement without issues

**Files changed:** `types.ts`, `payables/route.ts`, `drill-down-sheet.tsx`, `kpi-cards.tsx`, `dashboard-view.tsx`

---

### 2026-02-24 — Issue #88: Top 10 Suppliers — Stacked Overdue Segments — CLOSED

**What was built:**
Split each supplier's horizontal bar into 3 color-coded segments: Pago (teal), Pendente (urgency-tier colored), and Vencido (red). Added summary ribbon above the chart, enhanced tooltip with per-segment breakdown + max aging days, and a custom legend.

**What went well:**
- Direct analog of weekly calendar pattern — reused `computeUrgencyTier()`, same color palette, same stacked bar approach
- Three segments give complete visibility into supplier debt composition
- `_min: { dueDate: true }` trick avoids fetching individual records to compute max aging

**Mistakes caught:**
1. **Overdue query must be period-scoped**: initial implementation used `dueDate: { lt: today }` without `gte: rangeStart` — grabbed overdue payables from ALL time, making `overdueTotal` bigger than `total` and hiding the paid segment. Fix: `AND: [{ dueDate: { gte: rangeStart, lte: rangeEnd } }, { dueDate: { lt: today } }]`
2. **Two-segment chart missed PAID**: original plan only had Pendente + Vencido. `pendingAmount = total - overdueTotal` lumped PAID into green — user caught ITAU UNIBANCO showing as Pendente when it was Paid. Fix: added third `paidTotal` segment

**Files changed:** `types.ts`, `dashboard/route.ts`, `dashboard-charts.tsx`

---

### 2026-02-23 — Issue #79: Clickable Supplier Names — CLOSED

**What was built:**
- Supplier names across 4 tables now link to `/dashboard/fornecedores/{id}` via Next.js `<Link>`
- Tables changed: suppliers-table, payables-table, recurring-table, drill-down-sheet
- Subtle `hover:underline` styling — clickable without visual clutter
- Drill-down sheet uses conditional link (only when primary text is supplier name, not in supplier drill-downs)

**Mistakes caught:**
1. Original plan missed the suppliers list table (`suppliers-table.tsx`) — the most obvious place to click a supplier name. User's screenshot revealed we were fixing the wrong tables. Always check the page the user is actually looking at.
2. Fresh `git init` with no history caused a full-codebase initial commit. Had to `git reset --hard origin/main` and re-apply just the 4 file changes. Lesson: always `git log` before committing to verify the repo has history.

**Patterns established:**
- Clickable name recipe in TanStack tables: replace `<span className="font-medium">` with `<Link href={...} className="font-medium hover:underline">`, access row data via `info.row.original.fieldName`

---

### 2026-02-23 — Issue #63: AR Import Service — Persistence, Dedup, Audit — CLOSED

**What was built:**
- `src/lib/ar/errors.ts` — `DuplicateBatchError` custom error class with `existingBatchId` property. First custom error class in the codebase.
- `src/lib/ar/importService.ts` — `persistBatch(parsed, userId, tenantId, filename)` service function with 3 phases:
  1. Batch overlap detection: queries for existing `ImportBatch` with overlapping date range (same tenant), throws `DuplicateBatchError` if found
  2. Transaction dedup: queries existing `CardTransaction.transactionId` values, filters out already-imported ones, adds them to rejected list with reason
  3. Atomic insert: `prisma.$transaction()` creates ImportBatch + bulk-inserts CardTransactions via `createMany` + creates AuditLog entry. All-or-nothing.
- Edge cases handled: empty accepted list (batch still created with `acceptedRows: 0`), empty date range (skip overlap check, fallback dates)

**What went well:**
- First use of `prisma.$transaction()` in the codebase — clean implementation
- First custom error class — enables typed `instanceof` error handling
- Zero TypeScript errors, zero deviations from plan
- All Prisma queries include `tenantId` (tenant isolation verified)

**Mistakes caught — avoid next time:**
- None — clean implementation

**Patterns established:**
- `prisma.$transaction(async (tx) => { ... })` for atomic multi-table writes — tx client used for all queries inside the callback
- Custom error classes for business logic errors: extend `Error`, set `name`, carry structured data (e.g., `existingBatchId`)
- Date range overlap formula: `A.dateFrom <= B.dateTo AND A.dateTo >= B.dateFrom` — standard interval overlap check
- Service function pattern: pure business logic, no HTTP concerns (no `NextResponse`, no `Request`) — API route calls service and handles responses
- Dedup via Set: query existing IDs with `{ in: ids }`, build `Set<string>`, filter with `!existingSet.has(id)` — O(n) instead of O(n²)

---

### 2026-02-23 — Issue #62: RPInfo Flex XLSX Parser — CLOSED

**What was built:**
- `src/lib/ar/types.ts` — Shared TypeScript interfaces for the AR module: `ParsedTransaction`, `ParseError`, `ParseMeta`, `ParseResult` (parser types), plus `CardTransactionListItem`, `ImportBatchSummary`, `TransactionFilters`, `TRANSACTION_STATUS_CONFIG` (API/UI types)
- `src/lib/ar/importParser.ts` — Core parser function `parseImportFile(buffer)`: reads RPInfo Flex XLSX (header at row 6, ~1,900 data rows), validates each row with Zod, parses dates via `parseImportDate`, parses amounts with Brazilian format support, detects in-file duplicate Código, computes summary metadata (gross/net totals, date range)
- `src/lib/ar/validation.ts` — Zod schemas for future UI: `receiptFormSchema` (payment confirmation form) and `transactionFilterSchema` (transaction list filters)

**What went well:**
- Pure function layer — zero database dependencies, buffer in → structured data out
- Reused `parseImportDate` from existing AP import parser — no code duplication
- Zero new dependencies (xlsx and zod already installed)
- Zero TypeScript errors, zero deviations from plan
- All 3 files worked on first attempt — plan was detailed and accurate

**Mistakes caught — avoid next time:**
- None — clean implementation

**Patterns established:**
- AR parser follows same error-collection pattern as AP import: collect row-level errors with spreadsheet row numbers, continue processing remaining rows
- `z.union([z.string(), z.number()])` for XLSX cells that could be either type — XLSX doesn't guarantee string vs number
- Column name variants: RPInfo columns may have trailing periods ("Taxa Adm." vs "Taxa Adm") — accept both in Zod schema, use `??` fallback in parser
- `parseNumber()` handles raw XLSX numbers and Brazilian-formatted strings ("1.234,56" → 1234.56)
- Fee fields default to 0 if missing/invalid — some voucher rows may not have fees
- Row number formula: `HEADER_ROW_INDEX + 2 + dataIndex` — maps 0-indexed data array to 1-based spreadsheet rows accounting for header position

---

### 2026-02-23 — Issue #61: Add Prisma Schema Models for AR Module — CLOSED

**What was built:**
- `TransactionStatus` enum: PENDING, CONFIRMED, DIVERGENT, OVERDUE, CANCELLED
- `ImportBatch` model: tracks RPInfo spreadsheet imports (filename, row counts, gross/net totals, date range)
- `CardTransaction` model: individual card transactions with brand, acquirer, amounts, fees, installments, status. `transactionId` unique per tenant via `@@unique([tenantId, transactionId])`
- `PaymentReceipt` model: records payment receipt with divergence tracking. Uses `registeredById` (not `userId`) for semantic clarity
- `AuditLog` model: generic change tracking with before/after JSON snapshots, indexed by `(entityType, entityId)`
- Reverse relations added to `User` (importBatches, paymentReceipts, auditLogs) and `Tenant` (importBatches, cardTransactions, paymentReceipts, auditLogs)

**What went well:**
- Schema validated on first try, `prisma db push` succeeded without data loss warnings
- Zero TypeScript errors, zero deviations from plan
- Followed all existing conventions exactly: UUID PKs with `dbgenerated()`, `@map("snake_case")`, `@db.Timestamptz`, `@db.Date`, `@db.Decimal(12,2)`

**Mistakes caught — avoid next time:**
- None — the plan was detailed and all steps worked on first attempt

**Patterns established:**
- AR module schema follows same conventions as AP module: tenant isolation, UUID PKs, `@map` snake_case, `@db.Date` for date-only columns
- `registeredById` instead of `userId` when the semantic is different from "who created the record"
- Immutable event records (CardTransaction, AuditLog) omit `updatedAt` — only `createdAt`
- `feePct` uses `@db.Decimal(6, 4)` for percentage precision vs `@db.Decimal(12, 2)` for currency

**1 file modified (prisma/schema.prisma — 121 lines added). Zero new dependencies.**

---

### 2026-02-22 — Issue #53: Unify Suppliers Table with TanStack — CLOSED

**What was built:**
- Converted `suppliers-table.tsx` from manual HTML `<Table>` to TanStack Table with `columnHelper`, `flexRender`, `COLUMN_CLASSES` responsive map
- Added `SORT_MAP` whitelist to the Suppliers API (`name`, `document`, `active`, `createdAt`) with `sort`/`order` query params
- Added sort/order state + `handleSortChange` handler to `suppliers-view.tsx` orchestrator
- Supplier names changed from purple `<Link>` to plain `<span className="font-medium">` (matches payables pattern)
- Action button changed from `variant="ghost"` to `variant="outline"` (matches payables)
- Sortable column headers with `ArrowUp`/`ArrowDown`/`ArrowUpDown` indicators

**What went well:**
- Clean 3-file change following established patterns exactly — API SORT_MAP, orchestrator sort state, TanStack table
- Zero TypeScript errors on first try
- No deviations from the plan

**Mistakes caught — avoid next time:**
- None — the plan was specific and all steps worked on first attempt

**Patterns reinforced:**
- TanStack Table conversion recipe: API (SORT_MAP whitelist) → orchestrator (sort/order state + handler) → table (columnHelper + flexRender + COLUMN_CLASSES)
- All tables in the app now use the same structure: TanStack Table with manual sorting/pagination, `rounded-md border` wrapper, skeleton rows inside table for loading

**3 files modified. Zero new dependencies.**

---

### 2026-02-22 — Issue #48: Forward-Looking Date Presets — CLOSED

**What was built:**
- Added 2 forward-looking presets ("Próximos 7 dias", "Próximos 30 dias") to the dashboard's `PeriodSelector` date range filter bar
- Uses the same `Date.setDate()` pattern as the existing backward presets — `today + 7` and `today + 30`
- Active preset detection works automatically via existing string comparison logic — zero extra code needed

**Key decisions:**
- Single-file change in `src/components/dashboard/period-selector.tsx` — 11 lines added, 1 modified
- Zero new dependencies, zero new files
- Followed existing preset pattern exactly: compute dates → add entry to array → Badge auto-highlights

**1 file modified. Zero new dependencies.**

---

### 2026-02-22 — Issue #24 Phase 1: Recurring Payable Templates CRUD — CLOSED

**What was built:**
- `Frequency` enum (WEEKLY, MONTHLY, YEARLY) and `RecurringPayable` model in Prisma schema with relations to Tenant, User, Supplier
- `src/lib/recurring/types.ts` — RecurringListItem, RecurringDetail, RecurringFilters, FREQUENCY_LABELS
- `src/lib/recurring/validation.ts` — Zod schema with cross-field validation (MONTHLY requires dayOfMonth 1–28, endDate >= startDate)
- `src/app/api/recurring/route.ts` — GET (list with search/sort/pagination/active filter) + POST (create)
- `src/app/api/recurring/[id]/route.ts` — GET (detail) + PATCH (update, includes active toggle) + DELETE (ADMIN only)
- `src/app/dashboard/recorrencias/page.tsx` — server component with user role fetch
- `src/components/recurring/recurring-view.tsx` — orchestrator: state, fetch, debounced search, sort, active filter pills, Sheet/AlertDialog
- `src/components/recurring/recurring-table.tsx` — TanStack table with sortable columns, Switch toggle for active/inactive, dropdown actions
- `src/components/recurring/recurring-sheet.tsx` — dual-mode Sheet form (create/edit) with SupplierCombobox, frequency selector, date pickers, currency input, tag badges
- `src/config/navigation.ts` — added "Recorrências" with Repeat icon
- `src/components/ui/switch.tsx` — added shadcn Switch component for active toggle

**Key decisions:**
- `dayOfMonth` stored as string in Zod schema, parsed to number in API — avoids `z.coerce.number()` type inference conflict with zodResolver in Zod 4
- `active` field added as `z.boolean().optional()` in schema — not rendered in form UI, but used by the toggle PATCH endpoint
- Phase 2 (Vercel cron for auto-generating payables) deferred to a separate session

**11 files changed (9 new, 2 modified). Zero new npm dependencies (only added shadcn Switch).**

---

### 2026-02-22 — Issue #78: Overdue Payments Monitor + Segurado Date Fix — CLOSED

**What was built:**
- `daysOverdue` computed field added to both payables list and detail API routes — calculated server-side as `Math.floor((today - dueDate) / 86_400_000)` for PENDING/APPROVED payables with past due dates
- "Dias Vencidos" color-coded column in payables table — yellow (0-30d), orange (31-60d), red (61-90d), dark red (90+d)
- "Vencidos" filter pill changed from `status: "OVERDUE"` to compound `overdue: true` filter (status IN PENDING/APPROVED + dueDate < today)
- `daysOverdue` added to `SORT_MAP` with reversed direction (most overdue = oldest dueDate = ASC)
- Dashboard aging section: 3 KPI cards (avg days overdue, juros/multa exposure, critical 90+ count) + horizontal bar chart with 4 aging brackets + drill-down on click
- `AgingBracket` and `AgingOverview` types added to dashboard types
- `DrillDownFilter` extended with `overdue?: boolean` for aging bracket drill-downs
- Aging overview is always-live (not period-filtered), computed from a single Prisma query with in-memory bucket aggregation

**Data fix — segurado dates:**
- Discovered that 596 spreadsheet rows had "segurado DD/MM" in the Obs column indicating the actual expiry date, but import only used the original "Data" due date
- Example: OBRA PRIMA R$7,484.58 had dueDate 2026-02-23 (from "Data" column) but actually expired 2025-12-01 (from "segurado 01/12")
- Script `fix-segurado-dates.ts` reads the spreadsheet, parses segurado dates, matches by supplier CNPJ + payValue + dueDate, updates the dueDate
- CNPJ format mismatch caught: spreadsheet formatted (`06.136.910/0003-44`) vs DB digits-only (`06136910000344`) — `stripDocument()` fix
- 662 payables updated (398 PENDING, 264 PAID), 319 now correctly show as overdue totaling R$603,583.27

**Files changed (12 modified, 1 new + 2 scripts):**
- `src/lib/payables/types.ts` — added `daysOverdue` to PayableListItem, `overdue` to PayableFilters
- `src/lib/dashboard/types.ts` — added AgingBracket, AgingOverview, extended DrillDownFilter + DashboardResponse
- `src/app/api/payables/route.ts` — overdue filter, daysOverdue computed field, sort map entry
- `src/app/api/payables/[id]/route.ts` — daysOverdue in GET + PATCH responses
- `src/app/api/dashboard/route.ts` — aging queries + bracket computation
- `src/components/payables/payables-filters.tsx` — "Vencidos" pill uses compound overdue filter
- `src/components/payables/payables-table.tsx` — "Dias Vencidos" color-coded column
- `src/components/payables/payables-view.tsx` — pass overdue filter to API
- `src/components/dashboard/aging-cards.tsx` — **NEW** 3 KPI cards for aging overview
- `src/components/dashboard/dashboard-charts.tsx` — aging bracket bar chart with drill-down
- `src/components/dashboard/dashboard-view.tsx` — AgingCards section + pass brackets to charts
- `src/components/dashboard/drill-down-sheet.tsx` — pass overdue param
- `scripts/fix-segurado-dates.ts` — data correction script (dry-run + --apply)
- `scripts/delete-march-payables.ts` — one-time cleanup script

---

### 2026-02-22 — Issue #77: Import fails — Prisma client doesn't recognize jurosMulta — CLOSED

**What happened:**
- After Issue #52 added the `jurosMulta` field to `schema.prisma` and the import API route, importing a new spreadsheet failed with `Unknown argument 'jurosMulta'`
- The Prisma client in `node_modules/` was stale — it was generated before the `jurosMulta` field existed
- Fix: `npx prisma generate` + restart the dev server

**No code changes** — purely operational fix. The field was already in the schema, the API route already used it, the generated client just needed to be rebuilt.

**Also in this session:**
- Ran `npm run db:backfill-juros` to populate `jurosMulta` for 930 existing payables (231 had non-zero values, 699 set to 0)
- Confirmed data persisted correctly via direct SQL query

**Lessons reinforced:**
- After ANY schema change (`schema.prisma`), always run `prisma generate` AND restart the dev server — the Prisma singleton caches the old client in memory
- This is already documented in CLAUDE.md hard-won rules but was missed during the #52 ship workflow

---

### 2026-02-22 — Issue #54: Timezone Date Shift (Two Fixes) — CLOSED

**What was built:**
- Fix 1 (`e920217`): `validation.ts` — appended `T12:00:00` to bare `new Date()` in date comparison
- Fix 2 (`418286c`): `parsing.ts` — corrected Excel serial number epoch from Dec 30 to Dec 31, 1899
- Backfill script (`scripts/backfill-dates.ts`) — shifted all 930 existing payable dates forward by 1 day

**What went well:**
- First fix (validation.ts) was found via codebase audit — good proactive approach
- When user reported the bug persisted, asked WHERE they saw it (import path), which narrowed the root cause to the Excel serial number parser immediately
- Backfill script ran cleanly on 930 rows

**Mistakes caught — avoid next time:**
- The initial audit missed the Excel epoch bug because it only searched for `new Date(` with string arguments — the serial number path uses `new Date(epoch.getTime() + ...)` which is a different pattern
- First fix was shipped prematurely before confirming with the user that the symptom was resolved

**Patterns established:**
- Excel serial number epoch: use `new Date(1899, 11, 31)` (Dec 31, 1899), NOT Dec 30. Serial 1 = Jan 1, 1900
- When fixing a bug, always ask WHERE the user sees the symptom before assuming the root cause
- Non-idempotent backfill scripts: add a warning comment ("running twice would shift dates 2 days") and DON'T add to automated pipelines

---

### 2026-02-22 — Issue #50: Delete Payable — CLOSED

**What was built:**
- `DELETE /api/payables/[id]` endpoint — ADMIN-only, cleans up Supabase Storage files before cascade-deleting the DB record
- "Excluir" menu item in payables table dropdown — destructive red styling, `Trash2` icon, ADMIN-gated
- AlertDialog confirmation in both `payables-view.tsx` and `supplier-detail-view.tsx`

**Deviation from plan:**
- Plan listed 3 files, but `supplier-detail-view.tsx` also uses `PayablesTable` — adding the required `onDelete` prop meant wiring the same state/handler/dialog there too (4 files total)

**Patterns established:**
- Delete payable pattern: Storage-first cleanup → Prisma cascade delete. Non-blocking on storage failure (orphaned files are less harmful than stuck payables)
- Destructive menu item recipe: `DropdownMenuSeparator` + `className="text-destructive"` + `Trash2` icon, ADMIN-only guard
- When adding required props to shared components, check all consumers (Grep for `<ComponentName`) — plan may miss secondary usage sites

**What went well:**
- Plan-to-implementation was clean — only one gap (missing 4th file) caught during exploration
- Followed established attachment deletion pattern from `api/attachments/[id]/route.ts`
- TypeScript passed on first attempt despite 4-file change

---

### 2026-02-22 — Issue #49: Drilldown Panel Redesign — CLOSED

**What was built:**
- Redesigned `drill-down-sheet.tsx` from a cramped HTML table (512px, 10 rows) to a card-based layout (672px, "load more" pagination)
- Added summary bar with total R$ value, item count with "(X carregados)" indicator, and optional status badge
- Implemented append-mode pagination: `fetchPayables(pageToFetch, append)` with separate `loading` vs `loadingMore` states
- Smart primary/secondary text: supplier drilldowns show description (not redundant supplier name)
- Matching skeleton loading states (5 card skeletons with realistic proportions)
- Separator before footer for visual separation

**Patterns established:**
- Card-based drill-down list replaces HTML table — `rounded-lg border bg-card p-3` with two-row layout
- "Load more" append pattern: separate `loading` (skeleton) vs `loadingMore` (button spinner) states
- Summary bar in Sheet: `bg-muted/50` container (lighter than a full Card) for aggregate data inside a side panel
- Flexbox truncation: `min-w-0 flex-1 truncate` for text + `shrink-0` for amounts/badges

**What went well:**
- Single-file change, zero API modifications — reused existing paginated endpoint
- TypeScript passed on first attempt
- Clean approach: wider sheet + card layout + summary bar addressed all 9 issues in the GitHub issue

---

### 2026-02-21 — ADR-003: Authentication and Route Protection — CLOSED

**What went well:**
- Full auth flow implemented: login, logout, route protection, user seeding
- React 19 `useActionState` pattern for progressive enhancement forms
- Defense-in-depth approach (middleware + layout) for route protection
- Idempotent seed script that safely handles re-runs

**Mistakes caught — avoid next time:**
1. Prisma 7.x `engineType = "library"` does NOT work — it's silently ignored. Must use driver adapter
2. `DATABASE_URL` (pooled connection, port 6543) breaks the `pg` driver on Supabase — always use `DIRECT_URL`
3. The Prisma singleton pattern caches the client across hot reloads — changing `prisma.ts` requires a full server restart (not just hot reload)
4. Seed script needs the same adapter setup as the app's `prisma.ts` — don't use bare `new PrismaClient()`

**Patterns established:**
- Server Actions live in `src/lib/auth/actions.ts` (grouped by domain)
- Login form: Server Component page wrapper + Client Component form
- Dashboard: layout fetches user profile, passes props to header
- Logout button uses `<form action={signOut}>` for progressive enhancement

### 2026-02-21 — ADR-004: Base Application Layout — CLOSED

**What went well:**
- Collapsible sidebar layout using shadcn sidebar components (icon-only mode, mobile drawer)
- Dark mode via `next-themes` with ThemeProvider bridge pattern
- Data-driven navigation config (`src/config/navigation.ts`) — add a page by adding one line
- Clean Server → Client data flow: layout fetches once, passes props down

**Mistakes caught — avoid next time:**
1. React components (like Lucide icons) cannot be passed as props from Server Components to Client Components — they have methods and aren't serializable. Import them directly inside the Client Component instead.
2. `globals.css` already had sidebar CSS variables from shadcn init — no manual CSS setup needed

**Patterns established:**
- App shell: `SidebarProvider` > `AppSidebar` + `SidebarInset` in dashboard layout
- Navigation config lives in `src/config/navigation.ts` (data-driven UI pattern)
- Theme: `ThemeProvider` wraps app in root layout, `ThemeToggle` in dashboard header bar
- `suppressHydrationWarning` on `<html>` is required when using `next-themes` (class-based theming)
- Active nav link detection: exact match for `/dashboard`, prefix match for sub-pages
- User info (avatar + dropdown + logout) lives in `NavUser` sidebar footer component

### 2026-02-21 — ADR-005: Supplier CRUD (Fornecedores) — CLOSED

**What went well:**
- Full supplier CRUD: paginated table with search, side-sheet form, create/edit/soft-delete
- CNPJ/CPF check-digit validation with proper algorithms (weights, modulo 11)
- First API Routes in the codebase (`/api/suppliers`, `/api/suppliers/[id]`) with auth on every handler
- react-hook-form + Zod for complex form (12 fields, 4 sections, cross-field validation)
- Document uniqueness enforced at both app level (friendly 409 error) and DB level (`@@unique`)
- Debounced search (300ms) to avoid excessive API calls
- Soft delete via `active` boolean — deactivation checks for open payables before proceeding

**Mistakes caught — avoid next time:**
1. Zod 4 uses `error` (not `required_error`) in `z.enum()` options — Zod 3 docs are misleading
2. `prisma migrate dev` fails when existing migrations reference Supabase-only schemas (`auth`, `storage`) — use `prisma db push` instead for development
3. Optional string fields in Zod need `.optional().or(z.literal(""))` to accept empty strings from form inputs
4. `prisma.model.findUnique()` does NOT work with model-level `@@unique([field])` — Prisma only accepts `@id` or field-level `@unique` for `findUnique`. Use `findFirst()` instead for lookups on `@@unique` fields
5. Always wrap Prisma operations in try/catch inside API routes — unhandled errors cause Next.js to return HTML (not JSON), which crashes the client-side `res.json()` call. Return `{ error: message }` with status 500
6. After changing `prisma/schema.prisma`, the dev server must be **fully restarted** (kill process + `npm run dev`) — hot reload does NOT pick up Prisma client changes because the singleton caches the old client

**Patterns established:**
- API Routes authenticate via `createClient()` + `supabase.auth.getUser()` — return 401 if no user
- API route params are a Promise in Next.js 16 — must `await params` before accessing `id`
- Validation lives in `src/lib/<domain>/validation.ts`, shared types in `src/lib/<domain>/types.ts`
- Documents stored as raw digits in DB; formatting (dots/slashes/dashes) is a UI concern
- Zod `superRefine` for cross-field validation (document validity depends on document type)
- Orchestrator pattern: one Client Component owns state, passes data/callbacks to "dumb" children
- Server-side uniqueness errors mapped to form field errors via `form.setError()`
- Sheet component with `sm:max-w-lg` override for wider forms (default `sm:max-w-sm` is too narrow)

### 2026-02-21 — ADR-006: Import Suppliers from Spreadsheet — CLOSED

**What went well:**
- Bulk import of 228 suppliers from Excel spreadsheet (`planilhabase/*.xlsx`)
- Handled messy real-world data: scientific notation CNPJs, masked CPFs, missing documents, duplicates
- Reused existing `isValidCNPJ`/`isValidCPF` validators from `src/lib/suppliers/validation.ts`
- Script is fully idempotent — second run creates 0 new records
- Clear summary report with counts for each category (imported, duplicated, invalid, no document)

**Mistakes caught — avoid next time:**
1. Prisma `upsert` has the same limitation as `findUnique` — it does NOT work with model-level `@@unique` constraints. Use the find-then-create/update pattern instead (same lesson from ADR-005)
2. Excel stores long numbers (like CNPJs) as floating-point, which causes scientific notation (`7.66492E+13`). Use `{ raw: true }` in SheetJS `sheet_to_json` to preserve the original number, then `Math.round()` + `padStart(14, "0")` to recover the digits
3. DB unique constraint on `document` means you can't store multiple empty strings. Use unique placeholder values (`PENDENTE-001`, `PENDENTE-002`, etc.) for suppliers without documents

**Patterns established:**
- One-off scripts live in `scripts/` directory (not `prisma/`) — `prisma/` is reserved for schema/seed
- Import scripts follow the same DB setup pattern as `prisma/seed.ts` (dotenv, pg Pool, PrismaPg adapter, DIRECT_URL)
- For no-document imports, use `PENDENTE-NNN` placeholders — clearly identifiable in the UI as needing real documents later
- npm script naming: `db:import-suppliers` follows the `db:*` convention for database operations
- Business data files (spreadsheets) go in `/planilhabase/` and are gitignored

### 2026-02-21 — ADR-007: Payable Creation Form (Contas a Pagar) — CLOSED

**What went well:**
- Full payable creation flow: schema evolution, Zod validation, API routes, side-sheet form with 4 sections
- Clean Prisma schema evolution via `db push` (0 existing rows = safe to change column types)
- Searchable supplier combobox using shadcn pattern (Popover + Command/cmdk) — fetches all, filters client-side
- Brazilian currency parsing helper (`parseCurrency`) handles `1.234,56` and `1234,56` and `1234.56`
- Auto-sync between "valor original" and "valor a pagar" using `useRef` flag — stops when user manually edits
- Date pickers with `pt-BR` locale, tag toggles with clickable Badge components
- Orchestrator (`payables-view.tsx`) designed for easy ADR-008 extension — just add table + pagination

**Mistakes caught — avoid next time:**
1. After `prisma db push`, you must also run `prisma generate` to update the TypeScript types — otherwise `tsc` still sees the old model fields and every new field/enum shows as "does not exist"
2. Zod's `z.array(z.string()).default([])` creates an input/output type mismatch with react-hook-form's `zodResolver` — the input type allows `undefined` but the output is always `string[]`, causing a resolver type error. Fix: remove `.default([])` from Zod and set the default in `useForm`'s `defaultValues` instead

**Patterns established:**
- Combobox pattern: `Popover` + `Command` (cmdk) for searchable dropdowns — width set via `w-[--radix-popover-trigger-width]` to match trigger
- Currency fields flow: string in form → `parseCurrency()` in API → Prisma `Decimal` in DB
- Currency formatting on blur: `toLocaleString("pt-BR", { minimumFractionDigits: 2 })` for display
- Date picker pattern: `Popover` + `Calendar` with `locale={ptBR}`, store as `yyyy-MM-dd` string in form, convert to `Date` in API
- Auto-sync between related form fields: use `useRef` boolean to track whether user has manually edited the dependent field
- Tags as clickable `Badge` components toggling values in a `string[]` — no separate DB table needed for fixed options
- Juros/multa (interest/penalty) is calculated in real-time (`payValue - amount`) and displayed but NOT stored in DB
- Payable domain files follow the same structure as suppliers: `src/lib/payables/` (validation + types), `src/components/payables/` (UI), `src/app/api/payables/` (API)

### 2026-02-21 — ADR-008: Payables Table (Tabela de Títulos a Pagar) — CLOSED

**What went well:**
- TanStack Table (headless) with 10 columns rendered into shadcn `Table` components — visual consistency with suppliers table
- Server-side sorting, search (debounced 300ms), and pagination (25 rows/page) via extended API route
- SORT_MAP whitelist pattern in API — only allowed column names map to Prisma `orderBy`, preventing injection
- Brazilian formatting throughout: R$ currency (`toLocaleString`), dd/MM/yyyy dates, CNPJ/CPF (`formatCNPJ`/`formatCPF`)
- Dynamic due date colors: red if overdue, amber if due within 7 days (only for PENDING status)
- Responsive column hiding: CNPJ/CPF, Juros/Multa, Tags hidden on mobile via `hidden lg:table-cell`
- Disabled "Editar" and "Baixar" menu items as placeholders for future ADRs
- Fixed timezone bug in date pickers from ADR-007

**Mistakes caught — avoid next time:**
1. **`new Date("YYYY-MM-DD")` timezone trap**: JavaScript parses date-only strings as UTC midnight. In Brazil (UTC-3), this shifts the date back one day — clicking Feb 20 in the calendar would store/display Feb 19. Fix: always append `T12:00:00` when creating a Date from a stored `yyyy-MM-dd` string (e.g., `new Date(value + "T12:00:00")`). Using noon guarantees the date stays correct in any timezone up to ±12h offset
2. Don't modify shadcn's `calendar.tsx` `day` cell layout (`w-full h-full aspect-square`) without testing thoroughly — changing flex properties (`flex-1`, removing `aspect-square`) can break the visual grid. The original shadcn defaults work correctly

**Patterns established:**
- TanStack Table setup: `manualSorting: true` + `manualPagination: true` for server-side data — TanStack manages UI state only (sort indicators, column rendering)
- Sort state in orchestrator: `sort` (column ID) + `order` ("asc"/"desc"), toggled via `handleSortChange` — same column toggles direction, new column defaults to asc (except `dueDate` defaults desc)
- SORT_MAP pattern in API routes: `Record<string, (order) => PrismaOrder>` whitelist mapping URL params to Prisma `orderBy` — unknown sort values fall back to default
- Sortable header rendering: `Button variant="ghost"` with `ArrowUp`/`ArrowDown`/`ArrowUpDown` icons based on sort state
- Calculated display columns (like Juros/Multa): use `columnHelper.display()` instead of `columnHelper.accessor()` — no underlying data field, just computed from other row values
- Status/category badge maps: `STATUS_CONFIG` and `TAG_LABELS` as `Record<string, { label, variant }>` for consistent badge rendering
- `formatBRL()` helper: `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` with `tabular-nums` CSS for aligned columns
- Date safety rule: never use `new Date("YYYY-MM-DD")` for display — always add `T12:00:00` to force local time parsing

### 2026-02-21 — ADR-009: Filters and Search for Payables Table (Filtros e Busca) — CLOSED

**What went well:**
- Quick-filter pills (status/tag) + advanced filters (category, payment method, date range) in a clean two-row layout
- AND-based `conditions[]` array in the API — each active filter pushes a condition, all combine with `AND` logic
- Enum whitelists (`VALID_STATUSES`, `VALID_CATEGORIES`, `VALID_METHODS`) for safe filter validation — unknown values silently ignored
- Search expanded to include `notes` and `supplier.document` (CNPJ/CPF) in the existing OR array
- Quick pills are mutually exclusive with each other but independent from advanced filters — "Vencidos" + "Revenda" + "PIX" all active simultaneously
- Pagination counter improved: "Mostrando X de Y título(s)" always visible, pagination buttons only when `totalPages > 1`
- Zero new dependencies — reused existing shadcn components (Badge, Select, Popover, Calendar, Button)
- Clean implementation: 4 modified files + 1 new file, `npx tsc --noEmit` passes with zero errors

**Patterns established:**
- `conditions[]` + `AND` pattern for combining multiple optional filters in API routes — cleaner than nested ternaries or spreading into a single object
- Quick-filter pills: `Badge` with `variant="default"` (active) vs `variant="outline"` (inactive), setting `status`/`tag` while preserving other filters via spread (`{ ...filters, status, tag }`)
- Filter component is "dumb" (presentational): receives `filters` + `onFiltersChange` from orchestrator, never fetches data itself
- Every filter change resets `page` to 1 — prevents empty page when filters reduce total results
- Date range filters use `T00:00:00` / `T23:59:59` in API and `T12:00:00` for display — consistent with ADR-008 timezone safety rule
- Select dropdowns use sentinel value `"ALL"` mapped to `undefined` — Radix Select doesn't support `undefined` as a value
- `hasAnyFilter` boolean computed from all filter fields — drives visibility of "Limpar Filtros" button
- Pagination always rendered (counter useful even on single page), but nav buttons conditionally rendered inside the component

### 2026-02-21 — Security Fix: Tenant Isolation and Credential Hardening — CLOSED

**What went well:**
- Added `userId: user.id` scoping to all 7 Prisma queries across 3 API route files — full tenant isolation
- Ownership verification before every mutation (update, deactivate, create-with-relation)
- Supplier ownership check on payable creation — prevents linking a payable to another user's supplier
- Removed hardcoded password from `prisma/seed.ts` — now reads from `SEED_PASSWORD` env var
- Created `scripts/reset-passwords.ts` for bulk password resets via Supabase Admin API
- `.env.example` updated to document the new `SEED_PASSWORD` variable
- Zero TypeScript errors after all changes (`npx tsc --noEmit` clean)

**Mistakes caught — avoid next time:**
1. **Never ship API routes without tenant isolation** — authenticating the user (`getUser()`) only proves *who* they are, not *what they can access*. Every `where` clause must include `userId: user.id`
2. **`findUnique` doesn't accept compound filters** — when adding `userId` to a `where: { id }` clause, you must switch to `findFirst({ where: { id, userId } })` because Prisma's `findUnique` only accepts `@id` or `@unique` fields
3. **Shell env vars ≠ dotenv vars** — `dotenv/config` loads `.env` into the Node.js process, but the shell doesn't see them. To pass a `.env` value as a shell variable: `export $(grep '^VAR_NAME=' .env | xargs)` before the command
4. **Never hardcode passwords in source code** — even in seed scripts. Use env vars and document them in `.env.example`

**Patterns established:**
- Tenant isolation rule: every Prisma query in API routes must include `userId: user.id` in its `where` clause
- Ownership check before mutations: `findFirst({ where: { id, userId } })` returns null if the record doesn't belong to the user — return 404 (don't reveal that the record exists to other users)
- For the `conditions[] + AND` pattern (payables): push `{ userId: user.id }` as a condition alongside filters — it composes naturally
- For simple `where` objects (suppliers): spread `userId` directly into the object (`{ userId: user.id, OR: [...] }`)
- Document uniqueness checks scoped per user — two different users can have suppliers with the same CNPJ
- Password reset script: `scripts/reset-passwords.ts` uses `supabase.auth.admin.updateUserById()` — run with `NEW_PASSWORD="..." npm run db:reset-passwords`
- Seed script now requires `SEED_PASSWORD` env var — fails fast with a clear error if missing

### 2026-02-21 — ADR-010: Status Workflow (Workflow de Status) — CLOSED

**What went well:**
- Role-based status workflow: ADMIN can approve/reject/reopen, all roles can register payments
- Single transition endpoint (`POST /api/payables/[id]/transition`) handles all status changes — no route sprawl
- Transition map (`src/lib/payables/transitions.ts`) as single source of truth — both API (validation) and UI (menu items) read from the same `TRANSITIONS` object
- `getAvailableActions(status, role)` filters transitions by role — clean separation of authorization logic
- Dynamic actions dropdown replaces disabled placeholder items — menu items appear/disappear based on payable status + user role
- Payment date modal with calendar picker (same Popover + Calendar pattern as the rest of the app)
- Schema evolution was additive (new enum values + nullable columns) — no data migration needed

**Patterns established:**
- Transition map pattern: `TRANSITIONS: Record<string, StatusTransition[]>` defines every valid status change, target status, and required roles — single source of truth for workflow logic
- `getAvailableActions(currentStatus, userRole)` filters transitions by role — used by both UI (show/hide menu items) and API (validate requests)
- Single transition API endpoint: `POST /api/payables/[id]/transition` with `{ action, paidAt? }` body — avoids separate routes for each action
- Column factory function: `buildColumns(userRole, onTransition, onRequestPay)` replaces static `const columns` when columns need access to props/callbacks
- Payment modal pattern: `payingPayableId` state in orchestrator controls Dialog open/close
- Terminal statuses (`PAID`, `OVERDUE`, `CANCELLED`) have no entries in `TRANSITIONS` — `getAvailableActions()` returns `[]`

### 2026-02-21 — Organization-Scoped Tenant Isolation — CLOSED

**What went well:**
- Replaced per-user scoping (`userId`) with per-organization scoping (`tenantId`) across all API routes — team members now see the same data
- Safe two-phase schema migration: Phase 1 adds nullable `tenantId`, backfill script fills it, Phase 2 makes it required — zero downtime, zero data loss
- Centralized `getAuthContext()` helper (`src/lib/auth/context.ts`) replaced 6-8 lines of duplicated auth boilerplate per route with a 2-line call returning `{ userId, tenantId, role }`
- Compound unique constraint `@@unique([tenantId, document])` on suppliers — different orgs can have suppliers with the same CNPJ

**Mistakes caught — avoid next time:**
1. **`prisma db push` warns about data loss when replacing unique constraints** — changing `@@unique([document])` to `@@unique([tenantId, document])` requires `--accept-data-loss` flag because Prisma drops the old constraint. This is safe when you know the data is clean, but always verify first
2. **`@ts-expect-error` doesn't work on object properties inside function arguments** — it attaches to the next *statement*, not the next *property*. Use `as any` cast on the value instead
3. **One-time migration scripts become type-incompatible after Phase 2** — accept with `as any` and document why

**Patterns established:**
- **Tenant isolation rule (UPDATED)**: every Prisma query in API routes must include `tenantId: ctx.tenantId` in its `where` clause (replaces the old `userId: user.id` rule)
- **`userId` is now audit-only**: included in `create` data to track "who created this" but never used for access control queries
- **`getAuthContext()` pattern**: single function returns `{ userId, tenantId, role }` or `null`
- **Two-phase schema migration**: Phase 1 (nullable) → backfill → Phase 2 (required) — safe pattern for adding required columns to tables with existing data
- **Compound unique constraints**: `@@unique([tenantId, field])` for uniqueness scoped per organization

### 2026-02-21 — ADR-011: Batch Actions (Ações em Lote) — CLOSED

**What went well:**
- Row selection via TanStack Table's built-in `enableRowSelection` + shadcn Checkbox — "select all on page" with indeterminate state
- Floating `BatchActionBar` at screen bottom: shows count + total R$, role-aware buttons (Aprovar is ADMIN-only)
- Best-effort batch transition API (`POST /api/payables/batch-transition`) — processes up to 50 items independently, returns `{ succeeded, failed }` so partial success is possible
- Client-side CSV export with semicolon delimiter (Brazilian Excel standard) and UTF-8 BOM for accent support

**Patterns established:**
- Batch API pattern: `POST /api/payables/batch-transition` with `{ ids[], action, paidAt? }` — loops through IDs with per-item validation, returns `{ succeeded[], failed[] }` instead of all-or-nothing
- CSV export pattern: client-side `Blob` + temporary `<a>` element — UTF-8 BOM (`\uFEFF`) prefix ensures Excel reads accents correctly. Semicolon delimiter is the Brazilian Excel standard
- `AlertDialog` for destructive/batch confirmations vs `Dialog` for data-entry modals — semantic distinction

### 2026-02-21 — ADR-012: Edit Payable (Editar Título a Pagar) — CLOSED

**What went well:**
- Full edit flow: GET/PATCH API route at `/api/payables/[id]`, edit mode in `PayableForm`, data fetching in `PayableSheet`
- Reused the same `payableFormSchema` for both create and edit
- Status guard on PATCH: only `PENDING`, `APPROVED`, and `REJECTED` are editable

**Patterns established:**
- Dual-mode form: single component handles both create and edit via `payable: PayableDetail | null` prop
- Form `key` prop for mode switching: `key={payable?.id ?? "new"}` forces React to unmount/remount
- `EDITABLE_STATUSES` constant (`as const` tuple) shared between API and UI — single source of truth
- Sheet with data fetching: `useEffect` triggered by `open + payableId` fetches detail, manages loading/error/data states

### 2026-02-22 — ADR-013: File Attachments (Upload e Gestão de Anexos) — CLOSED

**What went well:**
- Full attachment lifecycle: upload (drag-and-drop), download (signed URL), delete (with confirmation) — all scoped by tenant
- Supabase Storage integration with private bucket — files are never publicly accessible
- Storage-first delete order prevents orphaned files
- Client-side + server-side validation (defense in depth): MIME type (PDF, PNG, JPG) and file size (5 MB)
- Attachment section lives OUTSIDE the form — attachments are independent CRUD operations

**Mistakes caught — avoid next time:**
1. **Do NOT set `Content-Type` header manually on `FormData` POST requests** — the browser sets it automatically with the correct multipart boundary string
2. **Node.js 18+ has native `FormData` and `Blob`** — no need for the `form-data` npm package

**Patterns established:**
- Storage path convention: `{tenantId}/{payableId}/{timestamp}-{sanitized-filename}`
- `fileUrl` stores the storage path (NOT a public URL) — signed URLs are generated on demand
- Tenant ownership check through parent relation: attachment → payable → `tenantId` check

### 2026-02-22 — ADR-014: KPI Cards do Dashboard — CLOSED

**What went well:**
- 4 financial KPI cards on the dashboard with parallel Prisma `aggregate` queries via `Promise.all`
- Data-driven `CARD_CONFIGS` array with skeleton loading state

**Patterns established:**
- Dashboard aggregation API: `GET /api/dashboard?from=&to=` with `getAuthContext()`
- `Promise.all` for parallel Prisma aggregations
- Card config array pattern: data-driven rendering via `.map()`, easy to extend
- Server Component page + Client Component cards pattern

### 2026-02-22 — ADR-015: Gráficos do Dashboard — CLOSED

**What went well:**
- 3 Recharts charts: stacked bar (daily payments), donut (status distribution), horizontal bar (top 10 suppliers)
- Prisma `groupBy` + pivot transform for chart data
- Refactored to `DashboardView` orchestrator owning a single fetch

**Mistakes caught — avoid next time:**
1. **Always `.split("T")[0]` before appending `T12:00:00`** — API returns full ISO strings, not date-only
2. **`@db.Date` columns still arrive as full ISO strings in JSON** — never assume `YYYY-MM-DD` format

**Patterns established:**
- Prisma `groupBy` + pivot for chart data
- Recharts dark mode: `tick={{ fill: "currentColor" }}`, `CartesianGrid className="stroke-border"`, custom tooltips with shadcn CSS variables
- Supplier name resolution via batch lookup (collect IDs → single `findMany` → Map)

### 2026-02-22 — Issue #37: ADMIN Status Workflow Enhancements — CLOSED

**What went well:**
- Reverse/cancel paid payables, ADMIN force-status override, unapprove transition
- The existing `TRANSITIONS` map made adding new transitions trivial (4-file recipe)

**Mistakes caught — avoid next time:**
1. **Prisma pg driver adapter may return enum values in different casing** — always `.toUpperCase()` on `payable.status` before lookup in TRANSITIONS map

**Patterns established:**
- Adding workflow transitions is a 4-file change: transitions map → single API → batch API → table
- Force-status (`action: "force-status"`) is a separate code path from the transition map

### 2026-02-22 — ADR-016: Seletor de Periodo (Date Range Filter) — CLOSED

**What went well:**
- Date range picker with presets, API switched from `?month=&year=` to `?from=&to=`
- Period state lives in URL search params — bookmarkable, shareable

**Mistakes caught — avoid next time:**
1. **`useSearchParams()` requires a `Suspense` boundary in Next.js App Router**

**Patterns established:**
- URL-driven state: `useSearchParams()` reads, `router.replace()` updates
- `toISODate(date)` helper using local time (avoids UTC shift)
- `Suspense` boundary rule for `useSearchParams()`

### 2026-02-22 — Period-Filtered KPIs: "A Vencer" and "Segurado no Periodo" — CLOSED

**What went well:**
- 2 new period-filtered KPI cards, 10 Prisma queries running in parallel

**Mistakes caught — avoid next time:**
1. **UI can render before the API route is rebuilt** — always guard with `if (!kpi) return null`

**Patterns established:**
- Prisma `tags: { has: "segurado" }` for array column filtering
- Defensive KPI rendering with null guard

### 2026-02-22 — Issue #34: Redesign Metadata Panel — CLOSED

**What went well:**
- Polished shadcn Card layout for audit metadata with avatars and relative times
- Refactored `getInitials` and `STATUS_CONFIG` to shared exports

**Patterns established:**
- Shared `getInitials(name)` in `src/lib/utils.ts`
- Shared `STATUS_CONFIG` in `src/lib/payables/types.ts`
- `formatDistanceToNow` with `{ addSuffix: true, locale: ptBR }` for Portuguese relative times

### 2026-02-22 — Issue #40: Date Range Filter & Timezone Audit — CLOSED

**What went well:**
- Fixed due date filter and audited all 22 Date patterns across `src/`

**Patterns established — the three date rules:**
- **Display/storage dates** → append `T12:00:00`
- **Range boundaries for queries** → append `T00:00:00.000Z` / `T23:59:59.999Z`
- **Never bare `new Date("yyyy-MM-dd")`**

### 2026-02-22 — ADR-017: Supplier Detail Page — CLOSED

**What went well:**
- Full supplier detail page reusing existing components
- `?include=summary` pattern for optional API enrichment

**Mistakes caught — avoid next time:**
1. **Conditional spread in column arrays needs explicit type annotations** for TypeScript inference

**Patterns established:**
- Optional API enrichment via `?include=summary` query param
- `hideSupplierColumns` conditional column pattern
- UUID validation in Server Component pages: `UUID_REGEX.test(id)` → `notFound()`

---

### 2026-02-24 — Issue #90: Status Distribution Donut — Drill-Down + Value Display — CLOSED

**What went well:**
- Clean 3-file implementation, zero TypeScript errors, zero deviations from the plan
- Extended existing Prisma `groupBy` query with `_sum` instead of adding a new query — no performance cost
- Reused the exact same drill-down pattern (click → `DrillDownFilter` → `onDrillDown()`) as all other charts
- Exploded OVERDUE slice uses Recharts `Sector` with trigonometric offset — clean math, no external deps
- OVERDUE drill-down correctly uses compound `overdue: true` filter (not `status: "OVERDUE"`)

**Mistakes caught — avoid next time:**
1. No mistakes — plan was well-specified and implementation was straightforward

**Patterns established:**
- Exploded pie slice: custom `shape` function on `<Pie>` using `Sector` with `cx/cy` offset along `midAngle` — offset only target slices, return normal `Sector` for others
- Donut drill-down: `<Cell onClick>` per slice — same `DrillDownFilter` contract as bar/aging charts
- Multi-line center label: chain `<tspan dy="1.3em">` elements inside `<text>` for stacked lines (count + label + value)
- Extending `groupBy` with `_sum`: add `_sum: { payValue: true }` to existing query rather than creating a new one — same DB round-trip, more data

---

<!-- Entries below moved from CLAUDE.md on 2026-02-25 -->

### Drill-Down Panel Patterns (from earlier sessions)

**Patterns established:**
- Recharts `<Bar>` `onClick` handler receives a `BarRectangleItem`, not the raw data — access original data via `(_data as unknown as { payload: T }).payload`
- Drill-down pattern: `DrillDownFilter` type (title + optional filters + date range) as the "contract" between chart click handlers and the Sheet component
- Reuse existing list API for drill-down: `GET /api/payables?supplierId=...&status=...&dueDateFrom=...&dueDateTo=...&pageSize=15` — no new endpoint needed
- Card-based drill-down list (not HTML `<table>`) — each payable is a `rounded-lg border bg-card p-3` card with two rows (name+amount+badge / description+date)
- "Load more" pagination: `fetchPayables(pageToFetch, append)` — `append: false` replaces list (skeleton), `append: true` spreads onto existing (button spinner). Separate `loading` vs `loadingMore` states
- Summary bar: `bg-muted/50` with total R$ value (`tabular-nums`), count with "(X carregados)" suffix, and optional status badge
- "Ver todos" link pattern: Sheet footer links to the full page (`/contas-a-pagar?filters...`) with pre-applied URL params via `URLSearchParams`
- Smart column hiding in drill-down: supplier drilldowns show description as primary text (supplier already in Sheet title), hide secondary text when it matches primary
- Orchestrator drill-down state: `useState<DrillDownFilter | null>(null)` — null = closed, non-null = open with those filters

### 2026-02-24 — Issue #96: Separate dueDate from Tracking Date — CLOSED

**What went well:**
- Clean 7-file change with zero new dependencies and zero TypeScript errors
- Plan was precise enough to implement without any deviations
- Root cause correctly identified: `dueDate` served dual roles (identity + tracking), breaking Tier 2 import matching when dates drifted

**Patterns established:**
- Immutable identity fields: `dueDate` frozen after creation, rolling data goes to `overdueTrackedAt` — keeps matching keys stable
- Conditional tracking field: `...(dateChanged ? { overdueTrackedAt: parsedDueDate } : {})` — only write when dates actually differ, avoid redundant data
- `select: { id: true, dueDate: true }` in match queries when you need to compare stored values before deciding what to update
- Cleanup script pattern: dry-run by default, `--apply` flag for execution (same as `fix-segurado-dates.ts` and `cleanup-duplicate-payables.ts`)

### 2026-02-23 — Issue #63: AR Import Service — Persistence, Dedup, Audit — CLOSED

**What went well:**
- First use of `prisma.$transaction()` and first custom error class (`DuplicateBatchError`) in the codebase
- Clean 3-phase service: overlap detection → transaction dedup → atomic insert
- Zero TypeScript errors, zero deviations from plan

**Patterns established:**
- `prisma.$transaction(async (tx) => { ... })` for atomic multi-table writes
- Custom error classes: extend `Error`, set `name`, carry structured data (e.g., `existingBatchId`) for typed `instanceof` handling
- Service function pattern: pure business logic, no HTTP concerns — API route calls service and handles responses
- Dedup via Set: `findMany({ where: { in: ids } })` → `Set<string>` → `filter(!set.has())` — O(n) lookup

### 2026-02-23 — Issue #62: RPInfo Flex XLSX Parser — CLOSED

**What went well:**
- 3 new files in `src/lib/ar/` (types, parser, validation) — pure function layer, zero DB dependencies, zero new npm packages
- Reused `parseImportDate` from AP import — no code duplication
- Zero TypeScript errors, zero deviations from plan

**Patterns established:**
- `z.union([z.string(), z.number()])` for XLSX cells — XLSX doesn't guarantee string vs number
- Column name variants: accept both "Taxa Adm." and "Taxa Adm" in Zod schema, `??` fallback in parser
- `parseNumber()` handles raw XLSX numbers + Brazilian-formatted strings ("1.234,56" -> 1234.56)
- Fee fields default to 0 if missing/invalid (some voucher rows lack fees)
- Row number formula: `HEADER_ROW_INDEX + 2 + dataIndex` for spreadsheet-matching error rows

### 2026-02-22 — Issue #24 Phase 1: Recurring Payable Templates CRUD — CLOSED

**What went well:**
- Full CRUD for recurring payable templates: schema, API, page, table, form — 11 files, zero new npm dependencies (only added shadcn Switch component)
- Followed the exact same domain file structure as the payables domain: `src/lib/recurring/`, `src/app/api/recurring/`, `src/components/recurring/`
- Reused existing patterns: orchestrator, SupplierCombobox, date picker, currency blur, tag toggle badges
- `active` toggle via Switch component sends PATCH with `active: !current` alongside all other form fields

**Mistakes caught — avoid next time:**
1. **Stale Prisma client**: after `prisma db push` + `prisma generate`, MUST restart dev server — hot reload doesn't pick up new models
2. **`z.coerce.number()` breaks `zodResolver` in Zod 4**: causes type inference mismatch with `@hookform/resolvers@5`. Fix: use `z.string()` and parse to number in the API route
3. **Missing `Switch` component**: shadcn doesn't include Switch by default — needed `npx shadcn add switch`

**Patterns established:**
- New domain recipe (11-file change): schema -> types -> validation -> API list+create -> API detail+update+delete -> page -> orchestrator -> table -> form/sheet -> navigation
- String-based numeric form fields: store as string in Zod schema, parse with `parseInt()` in API route
- Toggle via PATCH: include `active: z.boolean().optional()` in schema, spread in update data
- Quick filter pills (active/inactive): `Badge` with `variant="default"` (active) vs `variant="outline"`

### 2026-02-22 — Issue #78: Overdue Payments Monitor + Segurado Date Fix — CLOSED

**What went well:**
- Implemented full overdue monitoring: `daysOverdue` computed field in API, color-coded "Dias Vencidos" table column, compound "Vencidos" filter pill, dashboard aging section
- Fixed the "Vencidos" filter pill — was using `status: "OVERDUE"` -> changed to `overdue: true` compound filter
- `daysOverdue` sort maps to `dueDate` with reversed direction
- Data fix script corrected 662 payable due dates from spreadsheet "segurado DD/MM" annotations

**Mistakes caught — avoid next time:**
1. `PayableDetail extends PayableListItem` — when adding a field to ListItem, the detail route must also include it
2. CNPJ format mismatch: spreadsheet has formatted, DB stores digits-only — always strip formatting before matching
3. Shell escaping: `prisma.$disconnect()` in inline bash `-e` scripts breaks — use script files instead

**Patterns established:**
- Computed API field recipe (no DB column): compute in response mapping, add to types, add to SORT_MAP with inverted sort direction
- Compound overdue filter: `status IN (PENDING, APPROVED) AND dueDate < today` — more reliable than a dedicated OVERDUE status
- Aging brackets: compute in-memory from a single overdue query, serialize `Infinity` as `9999` for JSON
- `stripDocument()`: always strip CNPJ/CPF formatting before DB lookups
- Data correction scripts: dry-run by default, `--apply` flag for execution

### 2026-02-22 — Issue #52: Auto-Calculate Juros/Multa — CLOSED

**What went well:**
- Added `jurosMulta` Decimal column, computed server-side as `max(0, payValue - amount)` on every create/update/import
- Switched table column from `columnHelper.display()` to `columnHelper.accessor("jurosMulta")` (now sortable)
- Backfill script processed all 930 existing payables

**Patterns established:**
- Computed Decimal column recipe: schema column -> compute in all write paths -> include in all read paths -> switch table to `accessor()` -> add to SORT_MAP -> backfill script
- `display()` vs `accessor()` in TanStack Table: `display()` columns have no underlying data and cannot sort
- Backfill scripts: use `Math.round(value * 100) / 100` to avoid floating point precision issues with currency
- Nullable Decimal serialization: `p.jurosMulta?.toString() ?? "0"`

### 2026-02-25 — Dashboard Budget Gauge + Weekly Calendar Enhancements

**What went well:**
- Budget gauge now includes paid invoices as budget consumption (paid + pending + overdue = total)
- Weekly calendar chart shows 3 stacked segments (Pago/Vencido/Pendente) with budget heat map coloring
- ReferenceLine at spending limit for visual reference
- Sortable Top 10 NFs table with client-side sort (no re-fetch needed for 10 items)
- Zero TypeScript errors across all changes, 6 files modified

**Mistakes caught — avoid next time:**
1. **Status sort by `daysOverdue` breaks grouping**: Pagos and Pendentes both have `daysOverdue = 0`, so they mix together. Fix: assign ordinal `statusRank()` (Vencido=0, Pendente=1, Pago=2)
2. **Weekly top suppliers + grand total queries must include PAID**: When budget includes paid, the queries feeding the Top 10 table must also use `status: { in: ["PENDING", "APPROVED", "PAID"] }`

**Patterns established:**
- Budget consumption = paid + pending + overdue: all three statuses consume the weekly spending limit
- `getBudgetHeatColor(totalValue, limit)`: pure function for tier-based bar coloring (green < 60%, amber 60-80%, orange 80-95%, red > 95%)
- Recharts `ReferenceLine`: dashed line at budget limit — `strokeDasharray="6 4"` + `label={{ position: "right" }}`
- Client-side sort for small tables: `useMemo` + `useState<{field, order}>` — no re-fetch for 10 items or fewer
- `statusRank()` pattern: map display statuses to ordinal numbers for clean sort grouping
- Passing custom props to Recharts Tooltip: `<Tooltip content={<CustomTooltip budgetLimit={n} />} />`

---

## Session — 2026-02-26: AR Transactions Page UI (#69)

**What was done:**
- Implemented the main data view for the AR (Accounts Receivable) module — a filterable, sortable, paginated table of imported card transactions
- Created 4 new components following the exact payables orchestrator + TanStack Table pattern:
  - `transactions-table.tsx` — 9-column TanStack table with responsive hiding, skeletons, sort indicators
  - `transactions-filters.tsx` — 5 status quick-filter pills + brand/acquirer dropdowns + date range popovers
  - `transactions-pagination.tsx` — count display + prev/next buttons
  - `transactions-view.tsx` — orchestrator owning fetch, debounced search, sort, filters, pagination, gross/net summary bar
- Wired the page as a server component with `getAuthContext()` + Suspense boundary
- Fixed nav config to point sidebar link from stub `/recebimentos` to actual `/recebimentos/transacoes`
- Zero TypeScript errors, 6 files changed (4 new + 2 edited)

**What went well:**
1. Clean plan-first approach: `/plan #69` produced a complete spec, `/implement #69` executed it with no improvisation
2. Reusing the established payables pattern made implementation fast and consistent — no architectural decisions needed
3. API and types were already built from prior sessions (#61, #65), so this was purely frontend
4. Caught the nav config issue quickly when user reported the wrong page was showing

**Mistakes caught — avoid next time:**
1. **Nav link pointed to stub parent page**: The sidebar linked to `/dashboard/recebimentos` (a placeholder) instead of `/dashboard/recebimentos/transacoes` (the actual table). Always verify nav links when building new sub-pages — stubs can mislead users.

**Patterns established:**
- AR table replicates payables pattern exactly: orchestrator → table + filters + pagination (simplified — no batch actions, row selection, or transitions for MVP)
- Summary bar (gross/net totals) uses API-returned aggregates — no client-side computation needed
- `RIGHT_ALIGNED` Set for cleaner column alignment logic (vs inline string checks in payables)
- `formatPct()` helper alongside `formatBRL()` for fee percentage display

---

### 2026-02-28 — Issue #70: AR Dashboard UI — KPI Cards + Upcoming Receivables

**What was built:**
- 3 new AR components: `ar-dashboard-view.tsx` (orchestrator), `ar-kpi-cards.tsx` (4 KPI cards + overdue alert), `upcoming-receivables.tsx` (7-day summary table)
- Extended `ARDashboardSummary` type with `UpcomingDay[]` and `upcoming` field
- Added 2 new queries to the AR dashboard API: `groupBy expectedPaymentDate` for daily aggregates + `findMany` for brand pairs to compute top brand per day
- Replaced stub "em construção" page with live Suspense-wrapped dashboard
- Nav link corrected from `/recebimentos/transacoes` back to `/recebimentos` (dashboard is the landing page)

**What went well:**
1. Issue was already fully implemented from a previous session — `/ship` just needed to commit, push, and close
2. Clean separation of #70-specific files from other uncommitted work (many unrelated changes in working tree)
3. API design with `upcomingScope` shared between two queries avoids duplication

**Also in this session (before #70 shipping):**
- Fixed AP dashboard query #19 bug: `weeklyTopSuppliersRaw` had contradictory `actionStatus` conditions (`{ in: ["PAID"] }` AND `OR: [{ actionStatus: null }, ...]`), causing the "Limite de Compras" supplier list to be empty. Replaced with `NOT_CANCELLED` filter.

**Patterns established:**
- AR dashboard follows a simpler variant of the AP pattern: no period selector, no sparklines, no charts — just snapshot KPIs + upcoming table
- `topBrandForDay()` pattern: groupBy gives aggregates but not "most frequent category" — solve by fetching raw pairs and computing in JS (small dataset, avoids raw SQL)
- `DeltaBadge` sub-component reused for week-over-week trending indicator

---

### 2026-02-28 — Issue #71: AR Receipt Registration — API + UI

**What was built:**
- POST `/api/ar/receipts` — validates transaction is PENDING/OVERDUE, computes divergence, atomically creates PaymentReceipt + updates CardTransaction status + AuditLog via `prisma.$transaction()`
- `receipt-registration-dialog.tsx` — Dialog with date picker, currency input, notes textarea, and live divergence preview (green "Valores conferem" / red "Divergência: R$ X,XX")
- Wired into `transactions-table.tsx` (action dropdown with "Registrar Recebimento", enabled only for PENDING/OVERDUE) and `transactions-view.tsx` (orchestrator state + API handler + toast)
- Seed script `scripts/seed-ar-transactions.ts` for generating 50 fake transactions (10 OVERDUE + 40 PENDING)

**Mistakes caught — avoid next time:**
1. **`parseCurrency` didn't strip `R$` prefix**: The dialog pre-fills the amount as `R$ 1.234,56` (formatted). When submitted, `parseCurrency("R$ 1.234,56")` kept the `R$`, producing `Number("R$ 1234.56")` → `NaN` → "Valor recebido inválido". Fix: added `.replace(/[R$\s\u00A0]/g, "")` as the first step in `parseCurrency`. This is a shared utility — the fix benefits all callers, not just receipts.

**Patterns established:**
- AR receipt follows the same `registeringTxId` orchestrator state pattern as `payingPayableId` in AP
- `requestSchema = receiptFormSchema.extend({ transactionId })` — extend existing form schema inline for API-specific fields
- Live divergence preview via `useMemo` watching the form's `receivedAmount` field — no extra state needed
- `prisma.$transaction()` for atomic multi-table writes: receipt + status update + audit log
