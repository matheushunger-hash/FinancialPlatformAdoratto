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
- Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env`
- Idempotent: checks for existing Auth users, uses Prisma `upsert`
- Current users: Matheus (ADMIN), Gabriel (ADMIN), Wellington (USER) — all @superadoratto.com.br

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
