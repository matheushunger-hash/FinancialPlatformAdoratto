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

Also completed: Security Fix (Tenant Isolation), Org-Scoped Isolation, Issue #37 (ADMIN Workflow), Issue #34 (Metadata Panel), Issue #40 (Timezone Audit), Period-Filtered KPIs

Full session history: `docs/session-log.md`
