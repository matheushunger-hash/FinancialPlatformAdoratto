# Session Log (Archive)

Full session history moved from CLAUDE.md on 2026-02-22.
These logs document what was built, lessons learned, and patterns established in each session.

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
