# Plan: OVERDUE Detection Job — Daily Automated Status Update (#72)

## Context

Card transactions (AR module) have an `expectedPaymentDate`. When that date passes without payment confirmation, the transaction should become `OVERDUE`. Today this status exists in the enum but nothing sets it automatically. We need a daily cron job + manual script to mark stale `PENDING` transactions as `OVERDUE`.

**Dependency note:** ADR-023 (hosting/cron strategy) doesn't exist yet. This plan uses Vercel Cron as the default (simplest to set up) and documents alternatives.

## Approach

We follow the **domain job pattern**: pure job logic in `src/lib/ar/jobs/`, thin API route as the trigger, and a standalone script for manual runs. The job function receives a Prisma client as a parameter so both the API route (singleton) and the manual script (own client) can call it.

**Key design decisions:**
- **AuditLog.userId becomes optional** — system jobs have no user, so `null` is correct. This is a 2-line schema change.
- **Per-tenant audit entries** — one AuditLog row per tenant that had updates, preserving tenant isolation in the audit trail.
- **Date safety** — cron runs at 11:00 UTC (08:00 BRT) so UTC date = BRT date. The query uses `expectedPaymentDate < todayStart` (midnight UTC), correctly implementing the D+1 rule.
- **Idempotent** — only touches `PENDING` records, so running twice on the same day produces the same result.

## Steps

### 1. Make AuditLog.userId optional

**File:** `prisma/schema.prisma`
- Change `userId String @map("user_id") @db.Uuid` → `userId String? @map("user_id") @db.Uuid`
- Change `user User @relation(...)` → `user User? @relation(...)`
- Run `prisma db push` + `prisma generate`

**Why:** The existing AuditLog model requires a userId FK to the User table. System/cron jobs have no logged-in user. Making it optional is the correct modeling — `null` means "system action".

### 2. Create the job logic

**File (new):** `src/lib/ar/jobs/markOverdue.ts`

Core function signature:
```typescript
export async function markOverdueTransactions(
  db: PrismaClient,
  options?: { tenantId?: string; dryRun?: boolean }
): Promise<OverdueJobResult>
```

Logic:
1. Compute `todayStart` using UTC-safe date construction (noon trick NOT needed here — we need midnight UTC as a boundary)
2. Find all `PENDING` transactions where `expectedPaymentDate < todayStart`, optionally scoped by `tenantId`
3. If `dryRun`, return candidates without updating
4. `updateMany` to set `status: "OVERDUE"` for the matched IDs
5. Group candidates by `tenantId`, create one `AuditLog` per tenant with:
   - `action: "AUTO_MARK_OVERDUE"`
   - `entityType: "CardTransaction"`
   - `entityId: "batch"` (batch operation, not a single entity)
   - `userId: null` (system job)
   - `after: { count, transactionIds[] }`
6. Return `{ updated: number, byTenant: Record<string, number> }`

**Why a separate file under `jobs/`:** Keeps job logic testable and reusable. Both the API route and the manual script call the same function.

### 3. Create the API route

**File (new):** `src/app/api/ar/jobs/mark-overdue/route.ts`

- **POST** handler only
- Auth: validate `Authorization: Bearer <CRON_SECRET>` header (NOT user auth — this is a system endpoint)
- Guard: reject if `CRON_SECRET` env var is not set (fail-safe)
- Call `markOverdueTransactions(prisma)` (no tenantId = all tenants)
- Return `{ updated, byTenant }` as JSON
- Wrap in try/catch, return 500 on error

**Why POST, not GET:** Vercel Cron uses GET by default, but this job mutates data. We'll configure Vercel to hit a GET wrapper that internally delegates to POST logic. Actually — Vercel Cron only supports GET, so we'll use **GET** with CRON_SECRET validation. This is the standard Vercel pattern.

**Correction — use GET:**
```typescript
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ... call job
}
```

### 4. Create the manual script

**File (new):** `scripts/mark-overdue-manual.ts`

- Same DB setup pattern as other scripts: `dotenv/config` → `pg Pool` → `PrismaPg` adapter → `PrismaClient`
- Parse CLI args: `--tenant=<uuid>` (optional), `--dry-run` (optional)
- Call `markOverdueTransactions(prisma, { tenantId, dryRun })`
- Log results to console with counts per tenant
- Disconnect and exit

**Why a separate script:** Ad-hoc execution without hitting the API. Useful for testing, backfilling, or running outside the cron schedule.

### 5. Add CRON_SECRET to environment config

**File:** `.env.example`
- Add a new section for cron/job secrets:
  ```
  # Cron job authentication (used by /api/ar/jobs/mark-overdue)
  CRON_SECRET="generate-a-random-secret-here"
  ```

**Why:** Documents the new env var for other developers and deployment setups.

### 6. Create Vercel cron configuration

**File (new):** `vercel.json`
```json
{
  "crons": [
    {
      "path": "/api/ar/jobs/mark-overdue",
      "schedule": "0 11 * * *"
    }
  ]
}
```

- `0 11 * * *` = daily at 11:00 UTC = 08:00 BRT
- Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` from the project's env vars

**Why 11:00 UTC:** Ensures UTC date matches BRT date (Brazil is UTC-3). Running before 03:00 UTC would cause date mismatch.

### 7. Add npm script

**File:** `package.json`
- Add: `"db:mark-overdue": "npx tsx scripts/mark-overdue-manual.ts"`

## Files changed

| File | Change |
|---|---|
| `prisma/schema.prisma` | Make `AuditLog.userId` optional (`String?`, `User?`) |
| `src/lib/ar/jobs/markOverdue.ts` | **New** — pure job logic function |
| `src/app/api/ar/jobs/mark-overdue/route.ts` | **New** — GET endpoint protected by CRON_SECRET |
| `scripts/mark-overdue-manual.ts` | **New** — CLI script for manual execution |
| `.env.example` | Add `CRON_SECRET` documentation |
| `vercel.json` | **New** — Vercel cron schedule (daily 11:00 UTC) |
| `package.json` | Add `db:mark-overdue` npm script |

## Verification

1. **TypeScript**: `npx tsc --noEmit` — zero errors
2. **Schema push**: `npx prisma db push` succeeds, existing AuditLog data is preserved (nullable migration is non-destructive)
3. **Dry run test**: `npm run db:mark-overdue -- --dry-run` shows candidates without updating
4. **Manual run**: `npm run db:mark-overdue` marks PENDING transactions with past `expectedPaymentDate` as OVERDUE
5. **Idempotency**: Running the script twice produces 0 updates on second run
6. **API test**: `curl -X GET http://localhost:3000/api/ar/jobs/mark-overdue -H "Authorization: Bearer <secret>"` returns `{ updated: N }`
7. **Auth guard**: Same curl without the header returns 401
8. **AuditLog check**: Verify AuditLog entries exist with `action: "AUTO_MARK_OVERDUE"` and `userId: null`
9. **No side effects**: CONFIRMED, DIVERGENT, and CANCELLED transactions are untouched
