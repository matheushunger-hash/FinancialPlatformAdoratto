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
- **Forms**: use React 19 `useActionState` for progressive enhancement
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

### 2026-02-21 — ADR-003: Authentication and Route Protection

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

### 2026-02-21 — ADR-004: Base Application Layout

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
