# Plan: Buyer Budget Gauge & Weekly Payment Calendar (#84) — v2

## Context

The buyer at Adoratto has a spending limit of R$350.000 in open (PENDING) payables at any time. Today there's no visibility into how close he is to that cap, nor how the committed spend is distributed across upcoming weeks.

The CEO wants two things at a glance:

- **"Can I still buy?"** — How much of the R$350k limit is currently used.
- **"When is the money going out?"** — How those PENDING payables are spread across the next 5 weeks (Sat–Fri cycle).

## Design Decisions (from discussion)

| Decision | Choice | Rationale |
|---|---|---|
| Layout | Budget Gauge + Weekly Breakdown (two pieces) | Gauge answers the instant budget question; bars give timing context |
| Spending limit storage | Configurable in DB (settings table) | Limit may change seasonally or per business need |
| Statuses counted | PENDING only | Only uncommitted/unpaid payables count toward the buyer's open budget |
| Color thresholds | Green < 80%, Yellow 80–95%, Red > 95% | Matches business risk tolerance |
| Week cycle | Saturday → Friday | Company's operational cycle |
| Section behavior | Always-live (independent of period selector) | Persistent budget monitoring tool |

## Approach

### Two-Component Design

**A) BuyerBudgetGauge** — A prominent card showing:
- Linear progress bar: R$280.000 / R$350.000
- Color: green (#22C55E) / yellow (#EAB308) / red (#EF4444) based on utilization %
- Remaining text: "Restam R$70.000" or "Limite excedido em R$15.000"
- Percentage badge: "80%"

**B) WeeklyCalendar** — Vertical bar chart (5 bars):
- Current week (Sat–Fri) + 4 future weeks
- Bars show sum of PENDING payables by dueDate per week
- Current week highlighted with distinct color
- Click a bar → drill-down sheet filtered to that week's date range

Both sections sit between the Aging Cards and Period Selector (the "always-live" zone).

## Steps

### 1. Add TenantSettings to the database schema
**File:** `prisma/schema.prisma`

Add a `TenantSettings` model:
```prisma
model TenantSettings {
  id                  String   @id @default(cuid())
  tenantId            String   @unique @map("tenant_id") @db.Uuid
  buyerSpendingLimit  Decimal  @default(350000) @map("buyer_spending_limit") @db.Decimal(15, 2)
  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt           DateTime @updatedAt @map("updated_at") @db.Timestamptz

  tenant              Tenant   @relation(fields: [tenantId], references: [id])

  @@map("tenant_settings")
}
```

Add the reverse relation on the `Tenant` model (after `auditLogs`):
```prisma
settings TenantSettings?
```

Run: `npx prisma db push` then `npx prisma generate`

**Why a separate table:** Keeps tenant core data clean. Settings will grow over time (payment terms, notification preferences, etc.). Using `Decimal(15,2)` matches the `payValue` column type for consistency.

**Why `db push` not `migrate dev`:** CLAUDE.md rule — `prisma migrate dev` fails with Supabase-only schemas (`auth`, `storage`).

### 2. Seed default settings for existing tenant
**File:** `prisma/seed.ts`

After the tenant find-or-create block, add an upsert for TenantSettings:
```typescript
// Ensure tenant has default settings (idempotent)
await prisma.tenantSettings.upsert({
  where: { tenantId: tenant.id },
  update: {},  // don't overwrite if already exists
  create: {
    tenantId: tenant.id,
    buyerSpendingLimit: 350000,
  },
});
console.log("  TenantSettings ensured");
```

Run: `npm run db:seed` to apply.

### 3. Add types for budget gauge and weekly calendar
**File:** `src/lib/dashboard/types.ts`

Add after the `AgingOverview` section:
```typescript
// ---- Buyer Budget (#84) ----

export interface BuyerBudgetData {
  totalOpen: number;       // Sum of all PENDING payable values (R$)
  limit: number;           // Configured spending limit (R$)
  utilization: number;     // totalOpen / limit (0.0 – 1.0+, can exceed 1.0)
  remaining: number;       // limit - totalOpen (negative if over)
  status: "green" | "yellow" | "red";
  openCount: number;       // Number of PENDING payables
}

// ---- Weekly Calendar (#84) ----

export interface WeeklyPaymentData {
  weekStart: string;       // "2026-02-21" (ISO date, Saturday)
  weekEnd: string;         // "2026-02-27" (ISO date, Friday)
  label: string;           // "21/02 – 27/02" (display label)
  value: number;           // Sum of PENDING payValues in R$
  count: number;           // Number of PENDING payables
  isCurrent: boolean;      // true for the week containing today
}
```

Add to `DashboardResponse`:
```typescript
export interface DashboardResponse extends DashboardKPIs {
  charts: {
    dailyPayments: DailyPaymentData[];
    statusDistribution: StatusDistribution[];
    topSuppliers: TopSupplier[];
  };
  agingOverview: AgingOverview;
  buyerBudget: BuyerBudgetData;         // ← new
  weeklyCalendar: WeeklyPaymentData[];  // ← new
}
```

**Why `status` is computed server-side:** Keeps threshold logic centralized. If thresholds change, only the API needs updating — no client redeployment needed.

### 4. Add budget + weekly calendar queries to dashboard API
**File:** `src/app/api/dashboard/route.ts`

**4a. Import date-fns helpers** at the top:
```typescript
import { startOfWeek, endOfWeek, addWeeks } from "date-fns";
```

**4b. Import new types:**
```typescript
import type {
  DashboardResponse,
  DailyPaymentData,
  BuyerBudgetData,
  WeeklyPaymentData,
} from "@/lib/dashboard/types";
```

**4c. Define budget thresholds** (constant at file top):
```typescript
const BUDGET_THRESHOLDS = { green: 0.80, yellow: 0.95 };
```

**4d. Compute 5-week range** before `Promise.all` (after `sevenDaysFromNow`):
```typescript
// Weekly calendar: Sat–Fri weeks (#84)
const currentWeekStart = startOfWeek(today, { weekStartsOn: 6 });
const lastWeekEnd = endOfWeek(addWeeks(currentWeekStart, 4), { weekStartsOn: 6 });
```

**4e. Add 3 new queries** to the existing `Promise.all` (queries 16–18):
```typescript
// 16. Total PENDING payables — for buyer budget gauge (#84)
prisma.payable.aggregate({
  where: { ...tenantScope, status: "PENDING" },
  _sum: { payValue: true },
  _count: true,
}),

// 17. PENDING payables grouped by dueDate — for weekly calendar (#84)
prisma.payable.groupBy({
  by: ["dueDate"],
  where: {
    ...tenantScope,
    status: "PENDING",
    dueDate: { gte: currentWeekStart, lte: lastWeekEnd },
  },
  _sum: { payValue: true },
  _count: true,
}),

// 18. Tenant spending limit (#84)
prisma.tenantSettings.findUnique({
  where: { tenantId: ctx.tenantId },
  select: { buyerSpendingLimit: true },
}),
```

**4f. Compute budget gauge** (after `Promise.all`, near aging section):
```typescript
// ---- Buyer budget gauge (#84) ----
const totalOpen = Number(budgetRaw._sum.payValue ?? 0);
const limit = Number(tenantSettings?.buyerSpendingLimit ?? 350000);
const utilization = limit > 0 ? totalOpen / limit : 0;

const buyerBudget: BuyerBudgetData = {
  totalOpen,
  limit,
  utilization,
  remaining: limit - totalOpen,
  status:
    utilization >= BUDGET_THRESHOLDS.yellow ? "red" :
    utilization >= BUDGET_THRESHOLDS.green ? "yellow" : "green",
  openCount: budgetRaw._count,
};
```

**4g. Bucket weekly results** (same section):
```typescript
// ---- Weekly calendar bucketing (#84) ----
const weeklyCalendar: WeeklyPaymentData[] = [];
for (let i = 0; i < 5; i++) {
  const ws = addWeeks(currentWeekStart, i);
  const we = endOfWeek(ws, { weekStartsOn: 6 });
  const wsStr = ws.toISOString().split("T")[0];
  const weStr = we.toISOString().split("T")[0];
  const dd1 = wsStr.slice(8, 10), mm1 = wsStr.slice(5, 7);
  const dd2 = weStr.slice(8, 10), mm2 = weStr.slice(5, 7);
  weeklyCalendar.push({
    weekStart: wsStr,
    weekEnd: weStr,
    label: `${dd1}/${mm1} – ${dd2}/${mm2}`,
    value: 0,
    count: 0,
    isCurrent: i === 0,
  });
}
for (const row of weeklyCalendarRaw) {
  const dateMs = row.dueDate.getTime();
  const bucket = weeklyCalendar.find(
    (w) =>
      dateMs >= new Date(w.weekStart + "T00:00:00.000Z").getTime() &&
      dateMs <= new Date(w.weekEnd + "T23:59:59.999Z").getTime(),
  );
  if (bucket) {
    bucket.value += Number(row._sum.payValue ?? 0);
    bucket.count += row._count;
  }
}
```

**4h. Add both to response** alongside `agingOverview`:
```typescript
buyerBudget,
weeklyCalendar,
```

### 5. Create the BuyerBudgetGauge component
**File:** `src/components/dashboard/buyer-budget-gauge.tsx` (new)

```
Component structure:
├─ BuyerBudgetGauge
│  ├─ Loading → Card with Skeleton
│  ├─ Content → Card
│  │  ├─ Header: "Limite de Compras"
│  │  ├─ Main figure: "R$ 280.000 / R$ 350.000" (2xl semibold, tabular-nums)
│  │  ├─ Progress bar (full width, rounded, h-3)
│  │  │  ├─ Fill color based on status:
│  │  │  │  ├─ green:  bg-emerald-500 (#22C55E)
│  │  │  │  ├─ yellow: bg-yellow-500 (#EAB308)
│  │  │  │  └─ red:    bg-red-500 (#EF4444)
│  │  │  └─ Fill width: min(utilization * 100, 100)%
│  │  ├─ Bottom row (flex justify-between):
│  │  │  ├─ Left: status badge — "Dentro do limite" / "Próximo ao limite" / "Limite excedido"
│  │  │  └─ Right: "Restam R$ 70.000" or "Excedido em R$ 15.000"
│  │  └─ Subtle: "X títulos pendentes" (text-xs text-muted-foreground)
│  └─ Props: { data: BuyerBudgetData | null; loading: boolean }
```

Key details:
- Progress bar max is 100% visually, even if utilization > 1.0 (bar stays full, color is red)
- Formatted values use `formatBRL()` pattern from dashboard-charts (Intl.NumberFormat pt-BR)
- Status labels in Portuguese:
  - green: "Dentro do limite"
  - yellow: "Pr\u00f3ximo ao limite"
  - red: "Limite excedido"
- No drill-down on this component (it's a summary gauge)
- Follows existing `Card` + `CardHeader` + `CardContent` pattern from shadcn/ui
- Card height should match the WeeklyCalendar card for visual alignment

### 6. Create the WeeklyCalendar chart component
**File:** `src/components/dashboard/weekly-calendar.tsx` (new)

```
Component structure:
├─ CustomWeeklyTooltip — dark navy tooltip (TOOLTIP_CLASS pattern)
│  ├─ Week range in bold ("22/02 – 28/02")
│  ├─ R$ total (tabular-nums)
│  └─ Count: "X títulos pendentes"
├─ WeeklyCalendar
│  ├─ Loading → Card with Skeleton (matching card height)
│  ├─ Empty → "Sem pagamentos pendentes nas próximas semanas."
│  └─ Chart → Recharts BarChart (5 bars)
│     ├─ XAxis: week labels ("22/02 – 28/02"), tickStyle with currentColor
│     ├─ YAxis: compact BRL (formatCompactBRL pattern)
│     ├─ CartesianGrid: stroke-border, 0.5 opacity
│     ├─ Bar with <Cell> per entry:
│     │  ├─ Current week: #635BFF (Stripe purple)
│     │  └─ Future weeks: #93C5FD (light blue)
│     ├─ radius: [4, 4, 0, 0] (rounded top)
│     └─ onClick → onDrillDown({ title, dueDateFrom: weekStart, dueDateTo: weekEnd })
│  └─ Card wrapper: title "Vencimentos por Semana"
│  Props: { data: WeeklyPaymentData[] | null; loading: boolean; onDrillDown: (filter: DrillDownFilter) => void }
```

Key details:
- Height: 250px via `ResponsiveContainer`
- Drill-down passes `{ dueDateFrom: weekStart, dueDateTo: weekEnd }` — no status filter, so the drill-down sheet shows full picture for that week
- Drill-down title format: "Semana 22/02 – 28/02"
- Reuses `DrillDownFilter` type as-is — no changes needed

### 7. Wire both components into the dashboard layout
**File:** `src/components/dashboard/dashboard-view.tsx`

Import both components, place between `AgingCards` and `PeriodSelector`:
```jsx
{/* Aging breakdown — always-live (#78) */}
<AgingCards data={data?.agingOverview ?? null} loading={loading} />

{/* Buyer budget + weekly calendar — always-live (#84) */}
<div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
  {/* Budget gauge takes 2 cols */}
  <div className="lg:col-span-2">
    <BuyerBudgetGauge
      data={data?.buyerBudget ?? null}
      loading={loading}
    />
  </div>
  {/* Weekly calendar takes 3 cols */}
  <div className="lg:col-span-3">
    <WeeklyCalendar
      data={data?.weeklyCalendar ?? null}
      loading={loading}
      onDrillDown={setDrillDown}
    />
  </div>
</div>

{/* Period selector — separates always-live from period-filtered */}
<PeriodSelector from={from} to={to} onChange={handlePeriodChange} />
```

**Why 2:3 split:** The gauge is compact (mostly a progress bar + numbers), while the chart needs more horizontal space for 5 bars with readable labels. On mobile (`grid-cols-1`), they stack vertically.

## Files Changed

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `TenantSettings` model with `buyerSpendingLimit`, add relation on `Tenant` |
| `prisma/seed.ts` | Upsert default settings row for existing tenant (limit: 350000) |
| `src/lib/dashboard/types.ts` | Add `BuyerBudgetData`, `WeeklyPaymentData`, update `DashboardResponse` |
| `src/app/api/dashboard/route.ts` | Import date-fns, add 3 queries (#16-18), compute gauge + weekly buckets, add to response |
| `src/components/dashboard/buyer-budget-gauge.tsx` | **New** — progress bar card with color-coded budget status |
| `src/components/dashboard/weekly-calendar.tsx` | **New** — 5-bar chart with current week highlight, tooltip, drill-down |
| `src/components/dashboard/dashboard-view.tsx` | Import + render both components in 2:3 grid layout |

## Dependencies

- Zero new npm packages
- `date-fns` v4.1.0 (already installed) — `startOfWeek`, `endOfWeek`, `addWeeks`
- `recharts` (already installed)
- Prisma schema change requires `npx prisma db push` + `npx prisma generate`

## Verification

1. `npx prisma db push` — schema applies cleanly
2. `npx prisma generate` — types updated
3. `npm run db:seed` — TenantSettings row created
4. `npx tsc --noEmit` — zero TypeScript errors
5. Dashboard loads with budget gauge showing R$ total / R$ 350.000
6. Gauge color: green when < 80% (R$280k), yellow 80–95%, red > 95%
7. "Restam R$ X" shows correct remaining, or "Excedido em R$ X" when over
8. Weekly bars show only PENDING payables grouped by Sat–Fri weeks
9. Current week bar is purple (#635BFF), future weeks light blue (#93C5FD)
10. Click a bar → drill-down opens with correct week date range
11. Both sections are unaffected by Period Selector changes (always-live)
12. Empty state: no PENDING payables → gauge shows R$ 0 / R$ 350.000 (green), bars show empty message
13. Over limit: gauge shows red, remaining shows negative as "Excedido em R$ X"
14. Responsive: on mobile, gauge stacks above weekly chart
15. Verify `buyerSpendingLimit` can be updated in DB and gauge reflects the new value

## Future Considerations

- **Settings UI**: Add an admin page to edit `buyerSpendingLimit` without direct DB access
- **Multiple buyers**: If Adoratto adds more buyers, the limit could become per-user rather than per-tenant
- **Notifications**: Alert when utilization crosses 80% or 95% thresholds (WhatsApp/email)
- **Historical tracking**: Log weekly utilization snapshots for trend analysis
