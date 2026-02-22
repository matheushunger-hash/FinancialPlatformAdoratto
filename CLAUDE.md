# Project: Financial Platform Adoratto

## Tech Stack
- Next.js 16 (App Router, Turbopack, React 19)
- Supabase (Auth + PostgreSQL + Storage + RLS)
- Prisma 7.x ORM (with `@prisma/adapter-pg` driver adapter)
- Tailwind CSS 4 + shadcn/ui (new-york style)
- TypeScript (strict mode)

## Architecture Conventions
- **Language**: UI text in Portuguese (pt-BR), code/comments in English
- **Commit style**: `feat:`, `fix:`, etc. — reference ADR number in parentheses
- **Server Actions**: use `"use server"` in dedicated files under `src/lib/`
- **Forms (simple)**: use React 19 `useActionState` for progressive enhancement (e.g., login)
- **Forms (complex)**: use `react-hook-form` + `zodResolver` + Zod for 5+ fields with cross-field validation (e.g., supplier form)
- **Route protection**: defense in depth — middleware (primary) + layout (fallback)
- **User sync**: Supabase Auth manages credentials, Prisma `users` table stores profile data, shared UUID as PK
- **Tenant isolation**: all read queries scope by `tenantId` (org), `userId` is audit-only (createdBy). Auth via `getAuthContext()` in `src/lib/auth/context.ts`

## Important: Prisma 7.x Requires Driver Adapter
Prisma 7.x uses a WASM-based query compiler by default. `new PrismaClient()` without an adapter will fail with:
> "Using engine type 'client' requires either 'adapter' or 'accelerateUrl'"

**Always** use `@prisma/adapter-pg` + `pg` Pool when creating a PrismaClient:
```typescript
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

## Important: Use DIRECT_URL for Prisma (not DATABASE_URL)
The `pg` driver does NOT work with Supabase's connection pooler (port 6543). It causes "Tenant or user not found" errors. Always use `DIRECT_URL` (port 5432, direct connection) for Prisma — both in the app (`src/lib/prisma.ts`) and in scripts (`prisma/seed.ts`).

## Seed Script
- Located at `prisma/seed.ts`, run with `npm run db:seed`
- Requires `SUPABASE_SERVICE_ROLE_KEY` and `SEED_PASSWORD` in `.env`
- Idempotent: checks for existing Auth users, uses Prisma `upsert`
- Creates/finds "Adoratto" tenant, assigns `tenantId` to all seeded users
- Current users: Matheus (ADMIN), Gabriel (ADMIN), Wellington (USER) — all @superadoratto.com.br
- Password reset: `NEW_PASSWORD="..." npm run db:reset-passwords` (uses Supabase Admin API)
- Tenant backfill: `npm run db:backfill-tenant` (one-time script, already run)

---

## Session Log

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

**Mistakes caught — avoid next time:**
1. No new mistakes in this ADR — patterns were well-established from ADR-007 and ADR-008

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
- `npx tsc --noEmit` passes with zero errors, 10 files changed (7 modified, 3 new), 0 new dependencies

**Mistakes caught — avoid next time:**
1. No new mistakes in this ADR — patterns were well-established from previous ADRs

**Patterns established:**
- Transition map pattern: `TRANSITIONS: Record<string, StatusTransition[]>` defines every valid status change, target status, and required roles — single source of truth for workflow logic
- `getAvailableActions(currentStatus, userRole)` filters transitions by role — used by both UI (show/hide menu items) and API (validate requests)
- Single transition API endpoint: `POST /api/payables/[id]/transition` with `{ action, paidAt? }` body — avoids separate routes for each action
- Action-specific update data: `approve` sets `approvedBy`/`approvedAt`, `pay` sets `paidAt`, `reopen` clears approval fields — all handled in one route with conditional logic
- Column factory function: `buildColumns(userRole, onTransition, onRequestPay)` replaces static `const columns` when columns need access to props/callbacks
- Payment modal pattern: `payingPayableId` state in orchestrator controls Dialog open/close — `onRequestPay` sets ID, dialog confirm calls `handleTransition`, both paths clear the ID
- User role fetched in Server Component page (`contas-a-pagar/page.tsx`) and passed as prop — necessary because Next.js App Router doesn't share data between layout and page
- Terminal statuses (`PAID`, `OVERDUE`, `CANCELLED`) have no entries in `TRANSITIONS` — `getAvailableActions()` returns `[]`, dropdown shows "Sem ações disponíveis"
- `STATUS_CONFIG` extended with `APPROVED` (default/blue badge) and `REJECTED` (destructive/red badge) — consistent badge rendering pattern

### 2026-02-21 — Organization-Scoped Tenant Isolation — CLOSED

**What went well:**
- Replaced per-user scoping (`userId`) with per-organization scoping (`tenantId`) across all API routes — team members now see the same data
- Safe two-phase schema migration: Phase 1 adds nullable `tenantId`, backfill script fills it, Phase 2 makes it required — zero downtime, zero data loss
- Centralized `getAuthContext()` helper (`src/lib/auth/context.ts`) replaced 6-8 lines of duplicated auth boilerplate per route with a 2-line call returning `{ userId, tenantId, role }`
- Compound unique constraint `@@unique([tenantId, document])` on suppliers — different orgs can have suppliers with the same CNPJ
- `@@index([tenantId])` on payables for efficient tenant-scoped queries
- Backfill script successfully migrated all 226 existing rows (3 users, 219 suppliers, 4 payables) to the "Adoratto" tenant
- Seed and import scripts updated to create/reference tenant — fully forward-compatible
- `npx tsc --noEmit` passes with zero errors, 10 files changed (8 modified, 2 new), 0 new dependencies

**Mistakes caught — avoid next time:**
1. **`prisma db push` warns about data loss when replacing unique constraints** — changing `@@unique([document])` to `@@unique([tenantId, document])` requires `--accept-data-loss` flag because Prisma drops the old constraint. This is safe when you know the data is clean, but always verify first
2. **`@ts-expect-error` doesn't work on object properties inside function arguments** — it attaches to the next *statement*, not the next *property*. For suppressing type errors on specific properties (like `tenantId: null` after making the field required), use `as any` cast on the value instead
3. **One-time migration scripts become type-incompatible after Phase 2** — the backfill script queries `{ tenantId: null }` but Phase 2 makes `tenantId` required, so Prisma types reject `null`. Accept this with `as any` and document why

**Patterns established:**
- **Tenant isolation rule (UPDATED)**: every Prisma query in API routes must include `tenantId: ctx.tenantId` in its `where` clause (replaces the old `userId: user.id` rule from the Security Fix session)
- **`userId` is now audit-only**: included in `create` data to track "who created this" but never used for access control queries
- **`tenantId` is the access control dimension**: controls "which org owns this" — all read/write queries scope by it
- **`getAuthContext()` pattern**: single function returns `{ userId, tenantId, role }` or `null` — replaces raw Supabase `createClient()` + `getUser()` + optional profile fetch in every route
- **Two-phase schema migration**: Phase 1 (nullable) → backfill → Phase 2 (required) — safe pattern for adding required columns to tables with existing data
- **Compound unique constraints**: `@@unique([tenantId, field])` for uniqueness scoped per organization instead of globally
- **One-time migration scripts**: live in `scripts/`, use `as any` for post-migration type mismatches, include clear comments explaining why

### 2026-02-21 — ADR-011: Batch Actions (Ações em Lote) — CLOSED

**What went well:**
- Row selection via TanStack Table's built-in `enableRowSelection` + shadcn Checkbox — "select all on page" with indeterminate state
- Floating `BatchActionBar` at screen bottom: shows count + total R$, role-aware buttons (Aprovar is ADMIN-only)
- Best-effort batch transition API (`POST /api/payables/batch-transition`) — processes up to 50 items independently, returns `{ succeeded, failed }` so partial success is possible
- "Select all, filter at action time" design — users can select a mix of statuses, buttons show eligible counts and disable when 0
- Batch pay reuses the existing `PayablePayDialog` (single date picker for all items) — zero duplication
- Client-side CSV export with semicolon delimiter (Brazilian Excel standard) and UTF-8 BOM for accent support — downloads as `titulos-YYYY-MM-DD.csv`
- Confirmation dialog (AlertDialog) for batch approve shows eligible count + total R$ before executing
- Selection auto-clears on data refresh (page change, filter, sort) — prevents stale references
- `npx tsc --noEmit` passes with zero errors, 8 files changed (3 modified, 5 new), 0 new dependencies

**Mistakes caught — avoid next time:**
1. No new mistakes in this ADR — patterns were well-established from ADR-010 and earlier

**Patterns established:**
- TanStack row selection: `enableRowSelection: true` + controlled `rowSelection` state (lifted to orchestrator) + `onRowSelectionChange` updater pattern handles both function and value forms
- Batch API pattern: `POST /api/payables/batch-transition` with `{ ids[], action, paidAt? }` — loops through IDs with per-item validation (tenant scope, transition validity, role check), returns `{ succeeded[], failed[] }` instead of all-or-nothing
- Floating action bar: `fixed bottom-4 left-1/2 -translate-x-1/2 z-50` with `shadow-lg` — returns `null` when `selectedCount === 0` (conditional rendering, not CSS hide)
- Eligible-count buttons: compute `pendingCount` and `payableCount` from selected items, show in button label (`Aprovar (3)`), disable when 0 — user always knows how many items will be affected
- CSV export pattern: client-side `Blob` + temporary `<a>` element — no server endpoint needed since data is already in memory (max 25 items/page). UTF-8 BOM (`\uFEFF`) prefix ensures Excel reads accents correctly. Semicolon delimiter is the Brazilian Excel standard
- `escapeCSV()` helper: wraps values containing semicolons, quotes, or newlines in double-quotes, doubling inner quotes per RFC 4180
- `AlertDialog` for destructive/batch confirmations vs `Dialog` for data-entry modals (payment date) — semantic distinction between "are you sure?" and "provide input"

### 2026-02-21 — ADR-012: Edit Payable (Editar Título a Pagar) — CLOSED

**What went well:**
- Full edit flow: GET/PATCH API route at `/api/payables/[id]`, edit mode in `PayableForm`, data fetching in `PayableSheet`
- Sheet fetches detail by ID (not from table data) — keeps the list response lean while the edit form gets metadata fields (`createdByName`, `approvedByName`, `paidAt`)
- Reused the same `payableFormSchema` for both create and edit — no partial schema needed, API ignores `supplierId` on PATCH
- Status guard on PATCH: only `PENDING`, `APPROVED`, and `REJECTED` are editable — terminal statuses (`PAID`, `OVERDUE`, `CANCELLED`) return 400
- Supplier combobox locked in edit mode via `disabled` prop — prevents changing which supplier a payable belongs to
- Auto-sync disabled in edit mode: `userEditedPayValue.current = true` prevents the `useEffect` from overwriting the existing pay value on first render
- Read-only metadata panel at the top of the edit form: "Criado por", "Criado em", "Aprovado por", "Aprovado em", "Pago em"
- "Editar" dropdown item only appears for editable statuses, with a `DropdownMenuSeparator` before transition actions
- `npx tsc --noEmit` passes with zero errors, 7 files changed (6 modified, 1 new), 0 new dependencies

**Mistakes caught — avoid next time:**
1. No new mistakes in this ADR — patterns were well-established from ADR-005 (supplier CRUD) and ADR-010 (transitions)

**Patterns established:**
- Detail API route pattern: `GET /api/payables/[id]` returns `PayableDetail` (extends `PayableListItem` with metadata) — separate from the list endpoint to keep list responses lean
- Name lookup pattern: `prisma.user.findUnique({ where: { id: payable.userId }, select: { name: true } })` to resolve UUID → display name for `createdByName` / `approvedByName`
- Dual-mode form: single component handles both create and edit via `payable: PayableDetail | null` prop — `isEditing` derived boolean drives all conditional behavior
- Form `key` prop for mode switching: `key={payable?.id ?? "new"}` forces React to unmount/remount the form when switching between payables — necessary because `react-hook-form`'s `defaultValues` only apply on mount
- Date extraction from ISO strings: `payable.issueDate.split("T")[0]` to get `yyyy-MM-dd` for form `defaultValues`
- Currency pre-fill: `formatCurrencyBR(Number(payable.amount))` to convert API decimal strings (`"1234.56"`) to BR display format (`"1.234,56"`)
- `EDITABLE_STATUSES` constant (`as const` tuple) shared between API (status guard) and UI (conditional menu item) — single source of truth
- Sheet with data fetching: `useEffect` triggered by `open + payableId` fetches detail, manages loading/error/data states, resets on close
- `disabled` prop on combobox: `disabled` on Button + `Popover open={disabled ? false : open}` prevents both visual interaction and programmatic opening

### 2026-02-22 — ADR-013: File Attachments (Upload e Gestão de Anexos) — CLOSED

**What went well:**
- Full attachment lifecycle: upload (drag-and-drop), download (signed URL), delete (with confirmation) — all scoped by tenant
- Supabase Storage integration with private bucket — files are never publicly accessible, every download generates a 1-hour signed URL
- Storage-first delete order prevents orphaned files: delete from Storage, then from DB (if DB delete succeeds but storage fails, you'd have an unreachable file with no reference to find it)
- Idempotent `scripts/setup-storage.ts` creates the bucket + 3 RLS policies via raw SQL — reproducible setup, no manual Dashboard steps
- Client-side + server-side validation (defense in depth): MIME type (PDF, PNG, JPG) and file size (5 MB) checked in both `FileUploadZone` and the API route
- Attachment section lives OUTSIDE the form — attachments are independent CRUD operations, not form state. Upload/delete happen immediately, no "save" needed
- `fetchPayable` extracted to `useCallback` in `PayableSheet` — reusable by both the `useEffect` (initial load) and `AttachmentSection` (refresh after upload/delete)
- Zero new dependencies — native HTML5 drag events (`onDragOver`, `onDragLeave`, `onDrop`) + hidden `<input type="file">`, existing shadcn/lucide components
- `npx tsc --noEmit` passes with zero errors, 9 files changed (6 new, 3 modified), integration test passed all 8 steps (auth → upload → download → verify → delete → verify)

**Mistakes caught — avoid next time:**
1. **Do NOT set `Content-Type` header manually on `FormData` POST requests** — the browser sets it automatically with the correct multipart boundary string. Setting it manually breaks the boundary and the server can't parse the form data
2. **Node.js 18+ has native `FormData` and `Blob`** — no need for the `form-data` npm package for test scripts

**Patterns established:**
- Storage path convention: `{tenantId}/{payableId}/{timestamp}-{sanitized-filename}` — organized by tenant and payable, timestamp prevents name collisions
- `fileUrl` stores the storage path (NOT a public URL) — signed URLs are generated on demand via `supabase.storage.from("attachments").createSignedUrl(path, 3600)`
- Tenant ownership check through parent relation: attachment → payable → `tenantId` check. The attachment itself doesn't have `tenantId`, so we verify via its parent payable
- `DO $$ ... END $$` block with `pg_policies` check for idempotent RLS policy creation — PostgreSQL doesn't have `CREATE POLICY IF NOT EXISTS`
- Bucket creation via `INSERT INTO storage.buckets ... ON CONFLICT DO NOTHING` — idempotent bucket setup without Dashboard
- Storage RLS policies scoped by `bucket_id = 'attachments'` — won't affect future buckets. INSERT uses `WITH CHECK`, SELECT/DELETE use `USING`
- Drag-and-drop zone: native HTML5 events + `cn()` for conditional blue highlight on `dragOver` state — `border-primary bg-primary/5` when active
- File icon mapping: `application/pdf` → `FileText`, images → `ImageIcon` from Lucide
- `AlertDialog` inside list items: each attachment row has its own delete confirmation dialog via `AlertDialogTrigger` wrapping the delete button
- Orchestrator-outside-form pattern: `AttachmentSection` renders below `PayableForm` in the sheet, communicates via `onAttachmentsChange` callback (triggers `fetchPayable` to refresh the whole detail including attachments)
- Upload overlay: `relative` container with `absolute inset-0 bg-background/80` + spinner during upload — disabled state that still shows the zone underneath

### 2026-02-22 — ADR-014: KPI Cards do Dashboard — CLOSED

**What went well:**
- 4 financial KPI cards on the dashboard: Total a Pagar, Vencidos, A Vencer 7 dias, Pagos no Mês
- API route runs 5 Prisma `aggregate` queries in parallel via `Promise.all` — all database-side, no client-side aggregation
- "Pagos no Mês" includes `percentOfPlan` calculation (paid ÷ planned × 100) with a 5th query for the denominator
- Data-driven `CARD_CONFIGS` array maps each KPI to its icon, color, and border — same pattern as `navigation.ts`
- Skeleton loading state with 4 placeholder cards in the same grid layout — no layout shift when data arrives
- Color-coded left borders and icons: blue (total), red (overdue), amber (due soon), green (paid)
- Dark mode support for percentage text (`text-green-600 dark:text-green-400`)
- Page stays a Server Component — only `KPICards` crosses the client boundary (needs `useState`/`useEffect`)
- `npx tsc --noEmit` passes with zero errors, 4 files changed (3 new, 1 modified), 0 new dependencies

**Mistakes caught — avoid next time:**
1. No new mistakes in this ADR — patterns were well-established from previous ADRs

**Patterns established:**
- Dashboard aggregation API: `GET /api/dashboard?month=&year=` with `getAuthContext()` for auth + tenant scoping — same pattern as all other API routes
- `Promise.all` for parallel Prisma aggregations: 5 independent `prisma.payable.aggregate()` calls run concurrently — faster than sequential
- `activeStatuses` = `["PENDING", "APPROVED"]` as the filter for "still needs to be paid" — excludes `PAID`, `CANCELLED`, `OVERDUE` from totals
- Date boundaries for aggregations: `today` at midnight for overdue, `today+7` at 23:59:59 for due-soon, `monthStart`/`monthEnd` for monthly totals
- Percentage calculation with zero-division guard: `plannedSum > 0 ? Math.round((paidSum / plannedSum) * 100) : 0`
- `formatBRL()` local helper in dashboard component — same logic as payables table but kept local since it's a simple one-liner
- Card config array pattern: `CARD_CONFIGS: CardConfig[]` with `key`, `icon`, `borderColor`, `iconColor` — data-driven rendering via `.map()`, easy to extend
- Skeleton cards: same grid layout as real cards (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`) with `Skeleton` components matching the content dimensions
- Server Component page + Client Component cards: page handles metadata/layout, client component handles data fetching and interactivity

### 2026-02-22 — ADR-015: Gráficos do Dashboard — CLOSED

**What went well:**
- 3 Recharts charts on the dashboard: stacked bar (daily payments by status), donut (status distribution), horizontal bar (top 10 suppliers by value)
- Extended dashboard API with 3 Prisma `groupBy` queries running in parallel with the existing 5 aggregations (8 total via `Promise.all`)
- `DashboardResponse extends DashboardKPIs` — backward-compatible type extension, adds `charts` field without breaking existing KPI structure
- Pivot transform for daily data: flat `groupBy` rows reshaped into `{ day, PENDING, APPROVED, ... }` objects for Recharts stacked bars
- Top suppliers resolved via batch `findMany` (collect IDs → single query) instead of N+1 individual lookups
- Refactored `KPICards` from self-fetching to prop-driven — `DashboardView` orchestrator now owns the single fetch and distributes data to both `KPICards` and `DashboardCharts`
- Dark mode support: `fill: "currentColor"` on Recharts axes, `className="stroke-border"` on CartesianGrid, custom tooltips with shadcn CSS variables (`bg-popover`, `text-popover-foreground`)
- Empty state per chart ("Sem dados para este mês.") and skeleton loading matching the card layout
- `npx tsc --noEmit` passes with zero errors, 8 files changed (2 new, 6 modified), 1 new dependency (`recharts`)

**Mistakes caught — avoid next time:**
1. **Always `.split("T")[0]` before appending `T12:00:00` for timezone safety** — the API returns `dueDate` as a full ISO string via `.toISOString()` (e.g. `"2026-02-20T00:00:00.000Z"`), not a date-only string. Concatenating `T12:00:00` onto a full ISO string produces an invalid date (`"...000ZT12:00:00"`) and causes `RangeError: Invalid time value`. The earlier #38 fix missed this because it assumed the value was date-only
2. **`@db.Date` columns still arrive as full ISO strings in JSON** — even though Prisma stores them as date-only, `.toISOString()` in the API serialization adds the time portion. Never assume a date field is already in `YYYY-MM-DD` format on the client side

**Patterns established:**
- Orchestrator pattern for dashboard: `DashboardView` fetches `/api/dashboard` once, passes KPI data to `<KPICards>` and chart data to `<DashboardCharts>` — same pattern as `PayablesView`
- `DashboardResponse extends DashboardKPIs` for additive API changes — existing consumers still work, new consumers access `charts` field
- Prisma `groupBy` + pivot for chart data: `groupBy(["dueDate", "status"])` returns flat rows, post-process with `Map<day, DailyPaymentData>` to reshape into one object per day with all status columns
- `getUTCDate()` for `@db.Date` fields — avoids timezone-shifting when extracting day numbers from Prisma Date columns
- Recharts dark mode: `tick={{ fill: "currentColor" }}` on axes inherits from CSS color property; `CartesianGrid className="stroke-border"` uses shadcn border variable; custom tooltip components with `bg-popover`/`text-popover-foreground` classes
- Status color map (hex for SVG fills): `PENDING=#f59e0b`, `APPROVED=#3b82f6`, `PAID=#22c55e`, `OVERDUE=#ef4444`, `REJECTED=#6b7280`, `CANCELLED=#9ca3af` — matches badge colors used elsewhere in the app
- `formatCompactBRL` for chart Y-axis labels: values ≥1000 shown as `"1,5k"` to save space
- Chart layout: stacked bar full-width, donut + horizontal bar side-by-side below (`grid-cols-1 lg:grid-cols-2`)
- Supplier name resolution via batch lookup: collect `supplierId` array from `groupBy` results → single `findMany({ where: { id: { in: ids } } })` → `Map<id, name>` for O(1) lookups
- Date string safety rule (UPDATED): always `.split("T")[0]` before appending `T12:00:00` — never assume a date value is already in `YYYY-MM-DD` format

### 2026-02-22 — Issue #37: ADMIN Status Workflow Enhancements — CLOSED

**What went well:**
- 3 commits covering the full scope: reverse/cancel paid payables → ADMIN force-status override → unapprove transition
- **Reverse & cancel**: ADMIN can now reverse (`Estornar Pagamento` → PENDING) or cancel (`Cancelar` → CANCELLED) a PAID payable — PAID is no longer a dead end
- **Force-status override**: "Alterar Status" menu item (ADMIN-only, all payables) opens a dialog where the admin picks any target status from a select dropdown. Conditional date picker appears when PAID is selected. Bypasses the transition map entirely — a separate code path in the API
- **Unapprove**: ADMIN can "Desaprovar" an approved payable back to PENDING — clears approval fields, same cleanup logic as `reopen`
- The existing `TRANSITIONS` map architecture made reverse/cancel/unapprove trivial — adding entries to the map made both API validation and UI dropdown work automatically (4-file recipe)
- Force-status dialog follows the same pattern as `PayablePayDialog` — controlled open/close via orchestrator state, same Popover + Calendar for date picking
- Smart field cleanup in force-status: target PAID sets payment + approval, target APPROVED sets approval + clears payment, anything else clears all downstream fields
- `npx tsc --noEmit` passes with zero errors across all 3 commits, 6 files changed (5 modified, 1 new), 0 new dependencies

**Mistakes caught — avoid next time:**
1. **Prisma pg driver adapter may return enum values in different casing** — `payable.status` came back as `"Paid"` (mixed case) instead of `"PAID"` (Prisma schema casing). `TRANSITIONS["Paid"]` returned `undefined`, causing "action not valid" errors for PAID payables. Fix: always `.toUpperCase()` on `payable.status` before looking up in the TRANSITIONS map. Applied to both single and batch transition routes
2. **This casing issue only manifested for PAID status** — other statuses (PENDING, APPROVED, REJECTED) matched uppercase, so existing transitions worked fine. The bug was invisible until we added outgoing transitions from PAID

**Patterns established:**
- Adding workflow transitions is a 4-file change: transitions map (source of truth) → single API (field cleanup) → batch API (field cleanup + VALID_ACTIONS) → table (action icons)
- `reverse` action clears ALL downstream fields (payment + approval) when resetting to an earlier status — ensures the payable re-enters the full workflow cleanly
- Terminal-to-non-terminal transitions (PAID → PENDING) are safe as long as downstream fields are cleared — no orphaned approval/payment data
- Force-status (`action: "force-status"`) is a separate code path from the transition map — it validates ADMIN role, validates target status against a whitelist, and handles field cleanup based on target. Keeps the normal workflow clean while giving ADMINs full override capability
- `ForceStatusDialog` pattern: status select + conditional date picker (only for PAID target), controlled by `forceStatusPayableId` state in orchestrator — same open/close pattern as `PayablePayDialog`
- Enum casing safety rule: always `.toUpperCase()` on `payable.status` before looking up in `TRANSITIONS` — defensive against pg driver adapter returning mixed-case enum values
- Actions that share the same cleanup logic can be combined: `if (action === "reopen" || action === "unapprove")` — both clear approval fields when returning to PENDING

### 2026-02-22 — ADR-016: Seletor de Período (Date Range Filter) — CLOSED

**What went well:**
- Date range picker for the dashboard: 2 calendar pickers (De / Até) + 4 preset buttons (Este Mês, Mês Anterior, Últimos 7 dias, Últimos 30 dias)
- API switched from `?month=&year=` to `?from=&to=` (ISO date strings) — full flexibility for arbitrary ranges, defaults to current month if omitted
- `DailyPaymentData.day: number` → `.date: string` — stacked bar chart now works across months (not limited to day 1–31)
- Period state lives in URL search params (`?from=2026-02-01&to=2026-02-28`) — bookmarkable, shareable, browser back/forward navigates between periods
- KPIs 1–3 (Total a Pagar, Vencidos, A Vencer 7 dias) stay as live global snapshots — no date filter, always show current reality. Only KPI 4 (Pagos no Período), KPI 5 (planned denominator), and all 3 charts use the date range
- Active preset detection via simple string comparison of `from`/`to` against computed preset ranges — matching preset gets `variant="default"` Badge highlight
- Date range validation: picking a `from` after `to` auto-adjusts `to = from` (and vice versa) — prevents invalid ranges
- Reused existing Popover + Calendar + Badge patterns from `payables-filters.tsx` — zero new UI patterns, zero new dependencies
- `npx tsc --noEmit` passes with zero errors, 6 files changed (5 modified, 1 new), 0 new dependencies

**Mistakes caught — avoid next time:**
1. **`useSearchParams()` requires a `Suspense` boundary in Next.js App Router** — without it, Next.js shows a build warning/error. The page component that renders the client component using `useSearchParams` must wrap it in `<Suspense>`. Added to `dashboard/page.tsx`

**Patterns established:**
- URL-driven state for dashboard filters: `useSearchParams()` reads `from`/`to`, `router.replace()` updates the URL, `useEffect` re-fetches on change — same pattern usable for any page that needs shareable filter state
- `getDefaultRange()` helper computes current month boundaries (`YYYY-MM-01` to `YYYY-MM-lastDay`) — reused in both the client component (defaults) and API route (fallbacks)
- `toISODate(date)` helper formats a `Date` to `YYYY-MM-DD` using local time (manual `getFullYear`/`getMonth`/`getDate`) — avoids the UTC timezone shift from `toISOString()` which can shift the date in negative-offset timezones like Brazil
- Preset buttons pattern: array of `{ key, label, from, to }` objects computed from `new Date()` — `getPresets()` called on each render so "today"-relative presets are always fresh
- `formatDateLabel(isoDate)` for chart X-axis: `"2026-02-15"` → `"15/02"` using string splitting (no Date parsing = no timezone risk)
- `Suspense` boundary rule: any page rendering a client component that uses `useSearchParams()` must wrap it in `<Suspense>` — Next.js App Router requirement
- `router.replace()` for filter state changes (no extra history entries) — users navigate between periods via presets/pickers, browser back/forward still works for cross-page navigation

### 2026-02-22 — Period-Filtered KPIs: "A Vencer" and "Segurado no Período" — CLOSED

**What went well:**
- 2 new period-filtered KPI cards on the dashboard: "A Vencer no Período" (active payables due in range) and "Segurado no Período" (payables tagged `"segurado"` due in range)
- Added 2 Prisma `aggregate` queries (9 and 10) inside the existing `Promise.all` — all 10 queries run in parallel, minimal performance impact
- Dashboard now has a clear 2-section layout: 3 frozen snapshot KPIs on top, then period selector, then 3 period-filtered KPIs + charts below
- `GRID_CLASSES` extended to handle up to 6 cards — period section uses `lg:grid-cols-3` for its 3 cards
- Defensive `if (!kpi) return null` guard prevents crash when API response is stale or server hasn't restarted yet
- `npx tsc --noEmit` passes with zero errors, 4 files changed (4 modified), 0 new dependencies

**Mistakes caught — avoid next time:**
1. **UI can render before the API route is rebuilt** — after adding new fields to the API response, the dev server may still serve a cached response missing the new fields. `data[config.key]` returns `undefined`, causing `Cannot read properties of undefined (reading 'label')`. Fix: always cast to `KPICard | undefined` and guard with `if (!kpi) return null` before accessing properties. This makes the component resilient to partial/stale API responses

**Patterns established:**
- Prisma `tags: { has: "segurado" }` for filtering by a value inside a `String[]` array column — Prisma's `has` operator checks if the array contains the given string
- Defensive KPI rendering: `as KPICard | undefined` + null guard in the `.map()` loop — prevents crashes when the API shape evolves but the server hasn't restarted yet
- KPI section split pattern: `keys={["totalPayable", "overdue", "dueSoon"]}` for frozen cards, `keys={["paidThisMonth", "dueInPeriod", "insuredInPeriod"]}` for period-filtered cards — same component, different data slices
- New KPI recipe (4-file change): types (add field) → API route (add query + response field) → kpi-cards (add config entry) → dashboard-view (add key to the appropriate section)

### 2026-02-22 — Issue #34: Redesign Metadata Panel — CLOSED

**What went well:**
- Replaced the plain `bg-muted` metadata box in the payable edit form with a polished shadcn Card layout
- Card header shows "Auditoria" title + status Badge (using shared `STATUS_CONFIG` for consistent colors)
- 3 grouped sections separated by `Separator`: Criação (avatar + name + relative time), Aprovação (avatar or italic "Aprovação pendente"), Pagamento (date or italic "Aguardando pagamento")
- `formatDistanceToNow` from date-fns with `ptBR` locale for human-readable relative times ("há 3 dias")
- Hover `title` attribute on relative times shows absolute date/time as native browser tooltip
- Refactored `getInitials` from local function in `nav-user.tsx` to shared export in `src/lib/utils.ts` — now reused by both the sidebar avatar and the metadata panel
- Refactored `STATUS_CONFIG` from local constant in `payables-table.tsx` to shared export in `src/lib/payables/types.ts` — now reused by both the table badges and the metadata panel badge
- `npx tsc --noEmit` passes with zero errors, 5 files changed (5 modified), 0 new files, 0 new dependencies

**Mistakes caught — avoid next time:**
1. No new mistakes in this session — patterns were well-established from previous ADRs

**Patterns established:**
- Shared `getInitials(name)` in `src/lib/utils.ts` — extracts up to 2 uppercase initials from any name string, reusable anywhere avatars are needed
- Shared `STATUS_CONFIG` in `src/lib/payables/types.ts` — single source of truth for status → `{ label, variant }` mapping, used by table and form
- IIFE pattern in JSX for local variables: `{isEditing && (() => { const x = ...; return (...); })()}` — lets you compute values once without polluting the component scope
- Audit metadata Card pattern: `Card` > `CardHeader` (title + badge) > `CardContent` (avatar sections separated by `Separator`) — reusable for any entity's audit trail
- `formatDistanceToNow` with `{ addSuffix: true, locale: ptBR }` for Portuguese relative times — "há 3 dias", "há 2 horas"
- Native `title` attribute for absolute date tooltips — zero-dependency alternative to tooltip components for simple hover info

### 2026-02-22 — Issue #40: Date Range Filter & Timezone Audit — CLOSED

**What went well:**
- Fixed due date filter returning wrong results — `dueDateTo` was including one extra day because local-time parsing shifted `T23:59:59` into the next day in UTC
- Full codebase audit (22 Date patterns across `src/`) confirmed only 4 lines were unsafe — the rest already followed the `T12:00:00` or `Z` suffix conventions
- Fixed `issueDate` and `dueDate` on both create (POST) and edit (PATCH) routes — bare `new Date("yyyy-MM-dd")` was parsing as UTC midnight, potentially shifting dates back one day in UTC-3
- Dashboard API range boundaries had the same bug — fixed proactively in the same pass
- 3 commits, 4 files fixed, 0 new dependencies, `npx tsc --noEmit` clean across all commits

**Mistakes caught — avoid next time:**
1. **`new Date("yyyy-MM-dd")` parses as UTC midnight** — in Brazil (UTC-3), this shifts to the previous day at 21:00. Never use bare date-only strings with `new Date()`. Always append a time component
2. **`new Date("...T23:59:59")` without `Z` parses as local time** — in UTC-3, local midnight+23:59 becomes next-day 02:59 in UTC. For database range boundaries, always use explicit UTC (`Z` suffix)
3. **`new Date("...T12:00:00")` without `Z` parses as local noon** — this is SAFE for storage/display because noon stays on the correct calendar day in any timezone up to ±12h. But it's NOT suitable for range boundaries (use `Z` suffix for those)

**Patterns established — the three date rules:**
- **Display/storage dates** → append `T12:00:00` (noon trick, stays on correct calendar day in any timezone up to ±12h). Used for `issueDate`, `dueDate`, `paidAt` when writing to DB, and for formatting dates in the UI
- **Range boundaries for queries** → append `T00:00:00.000Z` / `T23:59:59.999Z` (explicit UTC, exact start/end of day). Used for filter `gte`/`lte` conditions and dashboard date range queries
- **Never bare `new Date("yyyy-MM-dd")`** — always append a time component. The only exception is `new Date()` for "now" (always safe)
- Codebase audit recipe: `Grep` for `new Date(` patterns → classify each as display/comparison/storage → verify time suffix matches the use case
