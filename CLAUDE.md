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
5. Update `docs/session-log.md` with full session narrative (date, what went well, mistakes, patterns)
6. Update `CLAUDE.md` ONLY if there are new **universal rules or patterns** to add to "Hard-Won Rules" or "Established Patterns" sections. **NEVER** add dated session entries, "What went well", "Mistakes caught", or per-session narratives to CLAUDE.md — those go exclusively in `docs/session-log.md`.
7. Close GitHub issue
8. Begin planning next ADR

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
- One-time migration scripts become type-incompatible after Phase 2 — use `as any` and document why
- Period-scoped overdue queries MUST include `gte: rangeStart` — without it, overdue from all time inflates the segment
- `AND` array for compound dueDate conditions: `AND: [{ dueDate: { gte: rangeStart, lte: rangeEnd } }, { dueDate: { lt: today } }]` when you need both range and overdue on the same field
- `_min: { dueDate: true }` in `groupBy` gives oldest dueDate → max days overdue without fetching individual records

### Date / Timezone (the three rules)
- **Display/storage dates** → append `T12:00:00` (noon trick, safe in any timezone ±12h)
- **Range boundaries for queries** → append `T00:00:00.000Z` / `T23:59:59.999Z` (explicit UTC)
- **Never bare `new Date("yyyy-MM-dd")`** — always append a time component
- Always `.split("T")[0]` before appending `T12:00:00` — API returns full ISO strings, never assume `YYYY-MM-DD` format
- `@db.Date` columns arrive as full ISO strings in JSON despite being date-only in Prisma
- `toISODate(date)` helper uses local time (`getFullYear/getMonth/getDate`) — avoids UTC shift from `toISOString()` in negative-offset timezones (Brazil)

### Next.js / React
- API route params are a Promise in Next.js 16 — must `await params` before accessing `id`
- React components (Lucide icons, etc.) are NOT serializable as Server→Client props — import inside Client Components
- `useSearchParams()` requires a `Suspense` boundary in Next.js App Router
- Do NOT set `Content-Type` header manually on `FormData` POST — browser sets it with correct boundary
- UI can render before API route is rebuilt — always guard with null checks for new API fields

### Tailwind CSS
- Never use dynamic class interpolation (`sm:grid-cols-${var}`) — Tailwind can't detect it at build time. Use complete class strings in ternaries instead
- OKLCH CSS variables don't resolve inside SVG `linearGradient` definitions — use hex colors directly for Recharts fills/strokes/gradients
- Stacked bar `radius` should only apply to the topmost bar — rounded corners on every bar creates visual artifacts at seams

### Zod / Forms
- Zod 4 uses `error` (not `required_error`) in `z.enum()` options
- Optional string fields: `.optional().or(z.literal(""))` to accept empty form strings
- Don't use `z.array().default([])` with zodResolver — set defaults in `useForm`'s `defaultValues` instead

### Security
- Never ship API routes without tenant isolation — `getUser()` proves identity, not access. Every `where` must include `tenantId`
- Never hardcode passwords in source code — use env vars and document in `.env.example`
- Shell env vars ≠ dotenv vars — `dotenv/config` loads into Node.js process only. Use `export $(grep '^VAR=' .env | xargs)` for shell

---

## Established Patterns

### Architecture
- **Orchestrator pattern**: one Client Component owns state (fetch, sort, filter, pagination), passes data/callbacks to "dumb" children
- **Domain file structure**: `src/lib/<domain>/` (validation + types), `src/components/<domain>/` (UI), `src/app/api/<domain>/` (API)
- **`getAuthContext()`**: returns `{ userId, tenantId, role }` — replaces raw Supabase auth boilerplate in every route
- **Tenant isolation**: every Prisma `where` clause includes `tenantId: ctx.tenantId`. `userId` is audit-only (in `create` data)
- **Shared constants**: `STATUS_CONFIG` in `src/lib/payables/types.ts`, `getInitials()` in `src/lib/utils.ts`
- **Compound unique constraints**: `@@unique([tenantId, field])` for uniqueness scoped per organization

### API
- **`conditions[]` + `AND`**: combine multiple optional filters by pushing conditions, all joined with AND
- **SORT_MAP whitelist**: `Record<string, (order) => PrismaOrder>` prevents sort injection — unknown values fall back to default
- **Batch API**: `{ ids[], action }` → per-item validation → returns `{ succeeded[], failed[] }` (not all-or-nothing)
- **Optional API enrichment**: `?include=summary` keeps default response lean, detail pages request computed data
- **Transition map**: `TRANSITIONS` object is single source of truth for workflow — both API and UI read from it. Adding transitions is a 4-file change: transitions map → single API → batch API → table
- **Force-status**: separate code path from transitions, ADMIN-only, validates against whitelist
- **Detail API route**: `GET /api/payables/[id]` returns extended type (adds metadata) — separate from list to keep responses lean
- **Server-side CSV export**: `GET /api/export` with same filter params as list, `take: MAX_EXPORT_ROWS` cap, `Content-Type: text/csv`
- **Import update mode**: match existing payables by `tenantId + supplierId + amount + dueDate` → update if found, create if not. `dueDate` is NEVER overwritten after creation — rolling dates go to `overdueTrackedAt` (#96)

### Tables (TanStack)
- `manualSorting: true` + `manualPagination: true` for server-side data — TanStack manages UI state only
- Sort state in orchestrator: `sort` + `order`, toggled via `handleSortChange` — same column toggles direction, new column defaults to asc
- `columnHelper.display()` for computed columns (no underlying data field)
- `enableRowSelection: true` + controlled `rowSelection` state lifted to orchestrator
- `formatBRL()` with `tabular-nums` CSS for aligned currency columns
- Column factory: `buildColumns(userRole, onTransition, onRequestPay)` when columns need props/callbacks

### Filters
- Quick-filter pills: `Badge` with `variant="default"` (active) vs `variant="outline"` (inactive)
- Every filter change resets `page` to 1
- Select sentinel `"ALL"` mapped to `undefined` — Radix Select doesn't support `undefined` as value
- `hasAnyFilter` boolean drives "Limpar Filtros" button visibility
- URL-driven state: `useSearchParams()` reads params, `router.replace()` updates — bookmarkable, no extra history entries

### UI Components
- **Combobox**: `Popover` + `Command` (cmdk) for searchable dropdowns. `disabled` via `Popover open={disabled ? false : open}`
- **Date picker**: `Popover` + `Calendar` with `locale={ptBR}`, store as `yyyy-MM-dd` string
- **Dual-mode form**: `payable: Detail | null` prop, `key={id ?? "new"}` forces remount on switch (react-hook-form `defaultValues` only apply on mount)
- **Sheet with data fetching**: `useEffect` on `open + entityId`, loading/error/data states
- **Currency flow**: string in form → `parseCurrency()` in API → Prisma `Decimal` in DB
- **CSV export (client)**: `Blob` + temp `<a>` element, UTF-8 BOM (`\uFEFF`), semicolons (Brazilian Excel). `escapeCSV()` per RFC 4180
- **CSV export (server)**: `window.open("/api/export?" + params)` — browser handles download natively
- **Payment modal**: `payingPayableId` state controls Dialog open/close
- **Floating action bar**: `fixed bottom-4 left-1/2 -translate-x-1/2 z-50`, returns `null` when empty
- **`AlertDialog`** for confirmations vs **`Dialog`** for data-entry modals
- **Audit metadata Card**: `Card` > `CardHeader` (title + badge) > `CardContent` (avatar sections + `Separator`)
- **`formatDistanceToNow`** with `{ addSuffix: true, locale: ptBR }` for Portuguese relative times

### Dashboard / Charts (Recharts)
- `Promise.all` for parallel Prisma aggregations (currently 15 queries)
- `activeStatuses` = `["PENDING", "APPROVED"]` for "still needs to be paid"
- Card config array: `CARD_CONFIGS: CardConfig[]` — data-driven rendering via `.map()`
- Pivot transform: `groupBy` flat rows → `Map<day, { PENDING, APPROVED, ... }>` objects
- Batch supplier lookup: collect IDs → single `findMany` → `Map<id, name>` for O(1)
- Status color map (hex for SVG): `PENDING=#f59e0b`, `APPROVED=#3b82f6`, `PAID=#22c55e`, `OVERDUE=#ef4444`, `REJECTED=#6b7280`, `CANCELLED=#9ca3af`
- Recharts dark mode: `tick={{ fill: "currentColor" }}`, `CartesianGrid className="stroke-border"`
- Dark tooltips: `bg-[#0A2540] text-white` light mode, `dark:bg-popover dark:text-popover-foreground` dark mode
- `computeDelta(current, previous)` with zero-division guard
- `buildSparkline(byDay, rangeStart, rangeEnd)` fills zero-value days for continuous area charts
- Previous period: `periodMs = rangeEnd - rangeStart`, shift back by that duration
- Bar background tracks: `background={{ fill: "var(--color-muted)", radius: 4 }}` for progress-bar effect
- Donut center label: `<Label content={({ viewBox }) => <text>}/>` using `viewBox.cx/cy` — multi-line via `<tspan dy="1.3em">`
- Exploded pie slice: custom `shape` function on `<Pie>` using `Sector` with trigonometric cx/cy offset along midAngle — only offset target slices (e.g., OVERDUE), return normal `<Sector>` for others
- Donut drill-down: `<Cell onClick>` per slice, OVERDUE uses compound `overdue: true` filter (not `status: "OVERDUE"`)
- Use hex colors for SVG fills — CSS variable refs may not resolve in SVG context
- KPI card drill-down: `CardConfig.buildFilter(from, to) => DrillDownFilter` — each card declaratively maps to its filter
- Comma-separated multi-status API filter: `status=PENDING,APPROVED` → `split(",")` → validate → `{ in: [...] }`
- Three-segment supplier bar: overdue `groupBy` (period+lt today) + paid `groupBy` (period+PAID) → `pendingAmount = max(0, total - overdueTotal - paidTotal)`
- IIFE `(() => { ... })()` inside JSX ternary: local scope for computed data + handlers without a sub-component

### Storage
- **Path convention**: `{tenantId}/{payableId}/{timestamp}-{sanitized-filename}`
- **`fileUrl` stores path, not URL** — signed URLs generated on demand via `createSignedUrl(path, 3600)`
- **Tenant check via parent**: attachment → payable → `tenantId` verification
- **Storage-first delete**: delete from Storage first, then DB — prevents orphaned files
- **Drag-and-drop**: native HTML5 events + `cn()` for conditional highlight, hidden `<input type="file">`

### Import Wizard
- Auto-mapping: `HEADER_PATTERNS` regex array matches spreadsheet headers to target fields
- Supplier dedup cache: `Map<document|name, supplierId>` avoids repeated DB lookups
- `PENDENTE-NNN` placeholder documents for suppliers imported without CNPJ/CPF
- `paidStatus` field: `/^sim$/i.test(value.trim())` → `status: "PAID"` + `paidAt: now`
- Update mode: match by `tenantId + supplierId + amount + dueDate`, `continue` after update to skip creation
- Import recipe (6-file change): types → parsing → API route → step-mapping → import-view → step-results

### Scripts
- One-off scripts live in `scripts/`, `prisma/` is reserved for schema/seed
- All scripts use the same DB setup: dotenv + pg Pool + PrismaPg adapter + DIRECT_URL
- npm naming: `db:*` convention for database operations
- Idempotent storage setup: `DO $$ ... END $$` with `pg_policies` check for RLS policies

### Multi-File Change Recipes
- **New status transition**: transitions map → single API (field cleanup) → batch API → table (icons)
- **New KPI card**: types → API route (query + response field) → kpi-cards (config entry) → dashboard-view (section key)
- **New import field**: types (target field + request/response) → parsing (header patterns) → API (extraction) → step-mapping → import-view → step-results

---

## Completed ADRs
ADR-003 (Auth), ADR-004 (Layout), ADR-005 (Supplier CRUD), ADR-006 (Import Suppliers), ADR-007 (Payable Form), ADR-008 (Payables Table), ADR-009 (Filters), ADR-010 (Status Workflow), ADR-011 (Batch Actions), ADR-012 (Edit Payable), ADR-013 (File Attachments), ADR-014 (KPI Cards), ADR-015 (Dashboard Charts), ADR-016 (Date Range Filter), ADR-017 (Supplier Detail Page)

Also completed: Security Fix (Tenant Isolation), Org-Scoped Isolation, Issue #37 (ADMIN Workflow), Issue #34 (Metadata Panel), Issue #40 (Timezone Audit), Period-Filtered KPIs, ADR-019 (CSV Export), Issue #46 (Import Pago? + Update Mode), Issue #39 (Dashboard Visual Overhaul), Issue #47 (Chart Drill-Down), Issue #49 (Drilldown Panel Redesign), Issue #50 (Delete Payable), Issue #54 (Timezone Validation Fix), Issue #78 (Overdue Payments Monitor), Issue #24 Phase 1 (Recurring Payables CRUD), Issue #61 (AR Schema Models), Issue #62 (RPInfo Flex XLSX Parser), Issue #63 (AR Import Service), Issue #48 (Forward-Looking Date Presets), Issue #53 (Unify Suppliers Table), Issue #61 (AR Schema Models), Issue #87 (KPI Cards Clickable Drill-Down), Issue #88 (Top 10 Suppliers Stacked Overdue), Issue #90 (Donut Drill-Down + Values), Issue #96 (Import Dedup — overdueTrackedAt)

Full session history: `docs/session-log.md`
