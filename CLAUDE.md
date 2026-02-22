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

## Project Structure
When working in this monorepo/project, always confirm the correct working directory before running npm commands. The main project is in the `landing-page` or app-specific subdirectory, not the repo root.

## Dev Server
Always kill any existing process on port 3000 before starting the dev server with `npm run dev`. Use `lsof -ti:3000 | xargs kill -9 2>/dev/null` first.

## Git Workflow
After any git merge, rebase, or PR merge, always `git pull` the working branch before running the dev server or making further changes.

## Build & Validation
This is a TypeScript/Next.js project using Prisma + Supabase. Always ensure zero TypeScript errors before committing. Run `npx tsc --noEmit` to verify.

## Coding Standards
- After implementing any feature, always guard against undefined/null data in UI components (especially when data comes from async API calls). Never assume API data is present on first render.
- When implementing features that touch database values (status enums, document types, etc.), always normalize casing. Database values may be mixed-case (`'Paid'`) while code uses uppercase (`'PAID'`) or lowercase. Use `.toUpperCase()` or a normalization layer consistently.

## Feature Implementation Workflow
Standard workflow for completing an ADR/feature:
1. Implement all files
2. Run TypeScript check (`npx tsc --noEmit`)
3. Test in dev server
4. Commit and push
5. Update `CLAUDE.md` (add new rules/patterns to Hard-Won Rules and Established Patterns sections) AND `docs/session-log.md` (full session narrative)
6. Close GitHub issue
7. Begin planning next ADR

---

## Hard-Won Rules (from past sessions)

### Prisma / Database
- `findUnique()` does NOT work with model-level `@@unique` — use `findFirst()` instead
- `upsert` has the same limitation — use find-then-create/update pattern
- After `prisma db push`, also run `prisma generate` to update TypeScript types
- After changing `schema.prisma`, fully restart the dev server — hot reload does NOT pick up Prisma client changes (singleton caches old client)
- `prisma migrate dev` fails with Supabase-only schemas (`auth`, `storage`) — use `prisma db push` for development
- Always wrap Prisma operations in try/catch inside API routes — unhandled errors return HTML (not JSON), crashing `res.json()`
- `prisma db push --accept-data-loss` is needed when replacing unique constraints — verify data is clean first
- Prisma pg driver adapter may return enum values in mixed casing (`"Paid"` not `"PAID"`) — always `.toUpperCase()` before lookups
- `tags: { has: "value" }` for filtering by a value inside a `String[]` array column
- Two-phase migration for adding required columns: Phase 1 (nullable) → backfill → Phase 2 (required)

### Date / Timezone (the three rules)
- **Display/storage dates** → append `T12:00:00` (noon trick, safe in any timezone ±12h)
- **Range boundaries for queries** → append `T00:00:00.000Z` / `T23:59:59.999Z` (explicit UTC)
- **Never bare `new Date("yyyy-MM-dd")`** — always append a time component
- Always `.split("T")[0]` before appending `T12:00:00` — API returns full ISO strings, never assume `YYYY-MM-DD` format
- `@db.Date` columns arrive as full ISO strings in JSON despite being date-only in Prisma

### Next.js / React
- API route params are a Promise in Next.js 16 — must `await params` before accessing `id`
- React components (Lucide icons, etc.) are NOT serializable as Server→Client props — import inside Client Components
- `useSearchParams()` requires a `Suspense` boundary in Next.js App Router
- Do NOT set `Content-Type` header manually on `FormData` POST — browser sets it with correct boundary
- UI can render before API route is rebuilt — always guard with null checks for new API fields

### Zod / Forms
- Zod 4 uses `error` (not `required_error`) in `z.enum()` options
- Optional string fields: `.optional().or(z.literal(""))` to accept empty form strings
- Don't use `z.array().default([])` with zodResolver — set defaults in `useForm`'s `defaultValues` instead

---

## Established Patterns

### Architecture
- **Orchestrator pattern**: one Client Component owns state (fetch, sort, filter, pagination), passes data/callbacks to "dumb" children
- **Domain file structure**: `src/lib/<domain>/` (validation + types), `src/components/<domain>/` (UI), `src/app/api/<domain>/` (API)
- **`getAuthContext()`**: returns `{ userId, tenantId, role }` — replaces raw Supabase auth boilerplate in every route
- **Tenant isolation**: every Prisma `where` clause includes `tenantId: ctx.tenantId`. `userId` is audit-only (in `create` data)
- **Shared constants**: `STATUS_CONFIG` in `src/lib/payables/types.ts`, `getInitials()` in `src/lib/utils.ts`

### API
- **`conditions[]` + `AND`**: combine multiple optional filters by pushing conditions, all joined with AND
- **SORT_MAP whitelist**: `Record<string, (order) => PrismaOrder>` prevents sort injection — unknown values fall back to default
- **Batch API**: `{ ids[], action }` → per-item validation → returns `{ succeeded[], failed[] }` (not all-or-nothing)
- **Optional API enrichment**: `?include=summary` keeps default response lean, detail pages request computed data
- **Transition map**: `TRANSITIONS` object is single source of truth for workflow — both API and UI read from it
- **Force-status**: separate code path from transitions, ADMIN-only, validates against whitelist

### UI Components
- **Combobox**: `Popover` + `Command` (cmdk) for searchable dropdowns
- **Date picker**: `Popover` + `Calendar` with `locale={ptBR}`, store as `yyyy-MM-dd` string
- **Dual-mode form**: `payable: Detail | null` prop, `key={id ?? "new"}` forces remount on switch
- **Sheet with data fetching**: `useEffect` on `open + entityId`, loading/error/data states
- **Currency flow**: string in form → `parseCurrency()` in API → Prisma `Decimal` in DB
- **CSV export**: client-side `Blob`, UTF-8 BOM (`\uFEFF`), semicolon delimiter (Brazilian Excel)
- **Recharts dark mode**: `tick={{ fill: "currentColor" }}`, `CartesianGrid className="stroke-border"`

### Storage
- **Path convention**: `{tenantId}/{payableId}/{timestamp}-{sanitized-filename}`
- **`fileUrl` stores path, not URL** — signed URLs generated on demand via `createSignedUrl(path, 3600)`
- **Tenant check via parent**: attachment → payable → `tenantId` verification

### Scripts
- One-off scripts live in `scripts/`, `prisma/` is reserved for schema/seed
- All scripts use the same DB setup: dotenv + pg Pool + PrismaPg adapter + DIRECT_URL
- npm naming: `db:*` convention for database operations

---

## Completed ADRs
ADR-003 (Auth), ADR-004 (Layout), ADR-005 (Supplier CRUD), ADR-006 (Import Suppliers), ADR-007 (Payable Form), ADR-008 (Payables Table), ADR-009 (Filters), ADR-010 (Status Workflow), ADR-011 (Batch Actions), ADR-012 (Edit Payable), ADR-013 (File Attachments), ADR-014 (KPI Cards), ADR-015 (Dashboard Charts), ADR-016 (Date Range Filter), ADR-017 (Supplier Detail Page)

Also completed: Security Fix (Tenant Isolation), Org-Scoped Isolation, Issue #37 (ADMIN Workflow), Issue #34 (Metadata Panel), Issue #40 (Timezone Audit), Period-Filtered KPIs, ADR-019 (CSV Export), Issue #46 (Import Pago? + Update Mode)

Full session history: `docs/session-log.md`

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

### 2026-02-22 — ADR-019: Server-Side CSV Export (Exportação CSV) — CLOSED

**What went well:**
- New `GET /api/export` route exports all filtered payables as a downloadable CSV — same filter params as `GET /api/payables` but no pagination (fetches all matching rows, up to 5000)
- "Exportar" button in toolbar shows total count (`Exportar (47)`) so the user knows how many rows they're getting
- Same CSV format as the existing client-side export: semicolons, UTF-8 BOM, dd/MM/yyyy dates, Brazilian decimal format
- Two export paths coexist cleanly: toolbar button (all filtered, server-side) vs batch bar button (selected rows, client-side)
- Also improved the import wizard: description field is now optional, falls back to supplier name
- `npx tsc --noEmit` passes with zero errors, 4 files changed (1 new, 3 modified), 0 new dependencies

**Mistakes caught — avoid next time:**
1. No new mistakes in this session — patterns were well-established from ADR-011 (batch actions/CSV export) and ADR-009 (filters)

**Patterns established:**
- Server-side CSV export pattern: `GET /api/export` with same filter params as the list route, `take: MAX_EXPORT_ROWS` safety cap, returns `new Response(csv)` with `Content-Type: text/csv` and `Content-Disposition: attachment`
- Download trigger pattern: `window.open("/api/export?" + params)` — browser handles the download natively, no Blob/anchor trick needed on the client
- Filter param reuse: `handleExport()` builds the same `URLSearchParams` as `fetchPayables()` minus pagination — ensures the export always matches what the user sees in the table
- Duplicating small filter/formatting logic across routes is acceptable when there are only 2 consumers — extract into a shared helper when a 3rd appears

### 2026-02-22 — Issue #39: Dashboard Visual Overhaul — Stripe/Linear Aesthetic — CLOSED

**What went well:**
- Complete dashboard visual overhaul: Inter font, Stripe purple accent (#635BFF), blue-gray background, dark tooltips, sparklines, delta comparisons
- Global CSS palette update via OKLCH CSS variables — every shadcn component (buttons, badges, sidebar, calendars) automatically adopted the new purple accent without per-component changes
- 5 new Prisma queries added to the existing `Promise.all` (15 total) for previous-period deltas and sparkline daily data — zero waterfall, all parallel
- Sparkline mini-charts (Recharts `AreaChart` with gradient fill) on 3 period-filtered KPI cards add information density without clutter
- Delta % badges with TrendingUp/TrendingDown icons give instant "better or worse?" context for period-filtered KPIs
- Donut center label shows total count, eliminating guessing which slice totals what
- Horizontal bar background tracks create a "progress bar" effect — classic Stripe/Linear pattern
- Dark navy tooltips (#0A2540) in light mode with automatic fallback to popover colors in dark mode
- Previous period calculation handles arbitrary ranges correctly (same-length window immediately before selected range)
- `npx tsc --noEmit` passes with zero errors, 7 files changed (7 modified), 0 new files, 0 new dependencies

**Mistakes caught — avoid next time:**
1. **OKLCH CSS variables don't resolve inside SVG `linearGradient` definitions** — Recharts renders gradients in SVG context where `var(--primary)` with OKLCH values may not work. Use hex colors directly for SVG fills/strokes (e.g., `#635BFF` instead of `hsl(var(--primary))`)
2. **Stacked bar `radius` should only apply to the topmost bar** — applying `radius={[4, 4, 0, 0]}` to every bar in a stack creates visual artifacts at the seams. Only the last (top) bar should have rounded corners

**Patterns established:**
- Global palette overhaul via CSS variables: change `--primary` in `globals.css` → every shadcn component updates automatically. No need to touch individual component files for color changes
- `computeDelta(current, previous)` helper: guards against division by zero (`previous === 0 ? (current > 0 ? 100 : 0)`), returns integer percentage
- `buildSparkline(byDay, rangeStart, rangeEnd)` helper: fills zero values for missing days within a date range, producing a continuous array for the area chart
- Previous period calculation: `periodMs = rangeEnd - rangeStart`, `prevRangeStart = rangeStart - periodMs - 1 day`, `prevRangeEnd = rangeStart - 1ms` — gives an equivalent-length window immediately before the selected range
- Sparkline from `findMany` + client-side aggregation: when grouping by a DateTime field (like `paidAt`), use `findMany` with `select` + client-side `Map<dayString, sum>` since Prisma `groupBy` doesn't support date truncation on DateTime fields
- Sparkline from existing data derivation: `dueInPeriod` sparkline derived from `dailyPayments` data (sum PENDING + APPROVED per day) — no extra query needed when the data already exists in a different shape
- SVG color rule: use hex colors directly for Recharts fills/strokes/gradients instead of CSS variable references — SVG rendering context may not resolve OKLCH values
- Shared tooltip class constant (`TOOLTIP_CLASS`): when 3+ tooltip components share the same styling, extract to a constant to avoid drift
- Dark tooltips pattern: `bg-[#0A2540] text-white` in light mode, `dark:bg-popover dark:text-popover-foreground` in dark mode — Stripe's signature visual element
- `background` prop on Recharts `<Bar>`: `background={{ fill: "var(--color-muted)", radius: 4 }}` renders a light gray track behind each data bar for progress-bar effect
- Donut center label: Recharts `<Label content={({ viewBox }) => <text>}/>` inside `<Pie>` — render custom text at the donut center using `viewBox.cx`/`viewBox.cy` coordinates

### 2026-02-22 — Issue #46: Import "Pago?" Column + Update Mode — CLOSED

**What went well:**
- New `paidStatus` target field maps the "Pago?" spreadsheet column — auto-detected via regex patterns (`Pago?`, `Paid`, `Status Pagamento`, `Já Pago`)
- When "Pago?" value is "Sim" (case-insensitive, whitespace-trimmed), payable is created with `status: "PAID"` + `paidAt: now` instead of default `PENDING`
- "Atualizar títulos existentes" checkbox in the mapping step enables update mode — matches existing payables by `tenantId + supplierId + amount + dueDate` and updates their status instead of creating duplicates
- Results screen shows a 4th "Títulos Atualizados" card (purple RefreshCw icon) only when updates occurred — normal imports look identical to before
- Toast messages dynamically include updated count (e.g., "5 importados, 3 atualizados!")
- Fully backwards-compatible: existing imports without "Pago?" column or without "Atualizar existentes" checked behave exactly as before
- `npx tsc --noEmit` passes with zero errors, 6 files changed (6 modified), 0 new files, 0 new dependencies

**Mistakes caught — avoid next time:**
1. **Never use Tailwind dynamic class interpolation** — `sm:grid-cols-${var}` won't be detected at build time. Always use complete class strings in ternaries: `hasUpdates ? "grid gap-4 sm:grid-cols-4" : "grid gap-4 sm:grid-cols-3"`

**Patterns established:**
- Import status mapping: extract raw value via `getField(row, "paidStatus")`, normalize with `/^sim$/i.test(String(value).trim())` — exact match only, "Simples" won't trigger
- Update mode in import API: `findFirst({ where: { tenantId, supplierId, amount, dueDate } })` to match existing payables → `update` if found, `create` if not → `continue` after update to skip creation
- `continue` in import loop to skip creation after update — cleaner than nesting the create in an `else` block
- Conditional results card: only render when `results.updated > 0` + adjust grid columns via full ternary class strings
- Import feature recipe (6-file change): types (target field + request/response) → parsing (header patterns) → API route (extraction + logic) → step-mapping (UI controls) → import-view (state + payload) → step-results (display)
