# Plan: Dashboard Visual Overhaul — Stripe/Linear Aesthetic (#39)

## Context

The current dashboard has 6 functional KPI cards (colored left-border accent, small text) and 3 Recharts charts (stacked bar, donut, horizontal bar) with basic shadcn styling. The app uses Geist font, neutral gray palette, and standard shadcn defaults. The visual target is a Stripe/Linear-inspired aesthetic: Inter font, purple accent palette (#635BFF), larger typography, sparkline mini-charts on period KPIs, delta % vs previous period, dark tooltips, rounded chart bars, and a donut with center label.

**Reference:** [shadcn dashboard example](https://ui.shadcn.com/examples/dashboard) + Stripe Dashboard aesthetic (see issue #39 description for full details).

## Approach

The overhaul spans 3 logical layers, all delivered in one PR:

1. **Foundation** — Inter font + new CSS variable palette (affects the entire app globally)
2. **Data layer** — Extend the dashboard API to return delta comparisons and sparkline data for the 3 period-filtered KPIs
3. **Component layer** — Redesign KPI cards, restyle charts, polish layout

**Key design decisions:**
- **Deltas + sparklines only on period-filtered KPIs** (paidThisMonth, dueInPeriod, insuredInPeriod) — the 3 snapshot KPIs (totalPayable, overdue, dueSoon) are live point-in-time values with no meaningful "previous period" to compare against
- **Previous period** is an equivalent-length window immediately before the selected range (e.g., Feb 1–28 → Jan 4–31, same 28-day span)
- **Zero new dependencies** — Recharts (already installed) supports `AreaChart` for sparklines

## Steps

### 1. Switch to Inter font

**File:** `src/app/layout.tsx`

- Replace `import { Geist, Geist_Mono } from "next/font/google"` with `import { Inter } from "next/font/google"`
- Create `const inter = Inter({ variable: "--font-inter", subsets: ["latin"] })`
- Remove `geistSans` and `geistMono` constants
- Update `<body className>` from `${geistSans.variable} ${geistMono.variable}` to `${inter.variable}`
- The `--font-mono` variable will fall back to the system monospace stack (set in step 2)

**Why:** Inter is the standard font for Stripe/Linear-inspired financial UIs. It has excellent `tabular-nums` support and looks crisp at all sizes. The app doesn't use monospace fonts in any meaningful way, so losing Geist Mono is fine.

---

### 2. Update global CSS palette

**File:** `src/app/globals.css`

**2a. Font mapping (inside `@theme inline`):**
- Change `--font-sans: var(--font-geist-sans)` → `--font-sans: var(--font-inter)`
- Change `--font-mono: var(--font-geist-mono)` → `--font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`

**2b. Light mode (`:root`) — target hex values converted to OKLCH:**

| Variable | Current | New (target hex) | Purpose |
|---|---|---|---|
| `--background` | `oklch(1 0 0)` (white) | `oklch(0.98 0.005 250)` (#F6F9FC — light blue-gray) | Page background |
| `--card` | `oklch(1 0 0)` | Keep `oklch(1 0 0)` (#FFFFFF — white) | Card surfaces float above bg |
| `--primary` | `oklch(0.205 0 0)` (near-black) | `oklch(0.55 0.27 285)` (#635BFF — Stripe purple) | Accent / buttons / links |
| `--primary-foreground` | `oklch(0.985 0 0)` | Keep (white text on purple) | Text on primary buttons |
| `--destructive` | current red | `oklch(0.55 0.22 17)` (#DF1B41 — Stripe red) | Error / negative |
| `--radius` | `0.625rem` (10px) | `0.75rem` (12px) | Border radius base |
| `--chart-1` | current | `oklch(0.55 0.27 285)` (#635BFF — purple) | Chart series 1 |
| `--chart-2` | current | `oklch(0.77 0.15 175)` (#00D4AA — teal) | Chart series 2 |
| `--chart-3` | current | `oklch(0.80 0.17 75)` (#F59E0B — amber) | Chart series 3 |
| `--chart-4` | current | `oklch(0.72 0.16 345)` (#F472B6 — pink) | Chart series 4 |
| `--chart-5` | current | `oklch(0.60 0.12 205)` (#0891B2 — cyan) | Chart series 5 |

Other variables (`--secondary`, `--muted`, `--accent`, `--border`, `--input`, `--ring`, `--popover`, `--card-foreground`, `--foreground`) — keep current neutral values. The Stripe palette is about the accent color + background, not changing every neutral.

**2c. Dark mode (`.dark`):**

| Variable | New target | Purpose |
|---|---|---|
| `--background` | `oklch(0.16 0.015 260)` (dark navy) | Dark page bg |
| `--card` | `oklch(0.20 0.015 260)` (slightly lighter) | Card surfaces |
| `--primary` | `oklch(0.65 0.25 285)` (brighter purple) | Accent — needs more brightness for dark bg |
| `--destructive` | `oklch(0.65 0.22 17)` (brighter red) | Error — more visible on dark |
| `--chart-1` through `--chart-5` | Slightly brighter versions of light mode values | Readable on dark bg |

**Why:** The Stripe palette uses a light blue-gray background (#F6F9FC) with pure white cards, creating visual depth through layering. The purple accent (#635BFF) is Stripe's signature and works beautifully for financial dashboards. Updating CSS variables means every shadcn component (buttons, badges, dropdowns, sidebar) automatically adopts the new palette.

---

### 3. Extend dashboard types

**File:** `src/lib/dashboard/types.ts`

Add two optional fields to the `KPICard` interface:

```typescript
export interface KPICard {
  label: string;
  value: number;
  count: number;
  percentOfPlan?: number;
  delta?: number;       // NEW: % change vs previous equivalent period (e.g., +12 or -5)
  sparkline?: number[]; // NEW: daily values for sparkline mini-chart
}
```

**Why:** Optional fields keep backward compatibility — the 3 snapshot KPIs won't include these fields, and the UI will conditionally render deltas/sparklines only when present.

---

### 4. Add API queries for deltas + sparklines

**File:** `src/app/api/dashboard/route.ts`

This is the most complex step. We're adding 5 new queries (15 total, up from 10), all inside the existing `Promise.all`.

**4a. Calculate previous period boundaries (add before `Promise.all`):**

```typescript
// Previous equivalent period: same duration, immediately before selected range
// e.g., Feb 1–28 (28 days) → Jan 4–31 (28 days)
const periodMs = rangeEnd.getTime() - rangeStart.getTime();
const prevRangeEnd = new Date(rangeStart.getTime() - 1); // day before rangeStart, end of day
prevRangeEnd.setUTCHours(23, 59, 59, 999);
const prevRangeStart = new Date(rangeStart.getTime() - periodMs - 86400000); // same duration back
prevRangeStart.setUTCHours(0, 0, 0, 0);
```

**4b. Add to Promise.all — 3 aggregate queries for previous period (deltas):**

```
// Query 11: Previous period — paid
prisma.payable.aggregate({
  where: { ...tenantScope, status: "PAID", paidAt: { gte: prevRangeStart, lte: prevRangeEnd } },
  _sum: { payValue: true },
  _count: true,
})

// Query 12: Previous period — dueInPeriod (active payables)
prisma.payable.aggregate({
  where: { ...tenantScope, status: { in: [...activeStatuses] }, dueDate: { gte: prevRangeStart, lte: prevRangeEnd } },
  _sum: { payValue: true },
  _count: true,
})

// Query 13: Previous period — insuredInPeriod
prisma.payable.aggregate({
  where: { ...tenantScope, tags: { has: "segurado" }, dueDate: { gte: prevRangeStart, lte: prevRangeEnd } },
  _sum: { payValue: true },
  _count: true,
})
```

**4c. Add to Promise.all — 2 new queries for sparkline data:**

```
// Query 14: Daily paid amounts (for paidThisMonth sparkline)
// Using findMany + client-side aggregation because paidAt is DateTime, not Date
prisma.payable.findMany({
  where: { ...tenantScope, status: "PAID", paidAt: { gte: rangeStart, lte: rangeEnd } },
  select: { paidAt: true, payValue: true },
})

// Query 15: Daily insured amounts (for insuredInPeriod sparkline)
prisma.payable.groupBy({
  by: ["dueDate"],
  where: { ...tenantScope, tags: { has: "segurado" }, dueDate: { gte: rangeStart, lte: rangeEnd } },
  _sum: { payValue: true },
})
```

For **dueInPeriod sparkline**: derive from existing `dailyRaw` data — sum `PENDING + APPROVED` per day. No new query needed.

**4d. Post-processing — compute deltas and sparkline arrays:**

**Delta formula:**
```typescript
function computeDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}
```

**Sparkline builder (for paidThisMonth — from findMany results):**
```typescript
// Group by paidAt date (truncate DateTime to date string)
const paidByDay = new Map<string, number>();
for (const row of paidSparklineRaw) {
  if (!row.paidAt) continue;
  const day = row.paidAt.toISOString().split("T")[0];
  paidByDay.set(day, (paidByDay.get(day) ?? 0) + Number(row.payValue ?? 0));
}
// Fill empty days and sort, extract values array
```

**Sparkline builder (for dueInPeriod — from existing dailyRaw):**
```typescript
// Sum PENDING + APPROVED per day from the dayMap
const dueSparkline = dailyPayments.map(d => d.PENDING + d.APPROVED);
```

**Sparkline builder (for insuredInPeriod — from groupBy):**
```typescript
// Convert groupBy results to sorted daily values
const insuredByDay = new Map<string, number>();
for (const row of insuredSparklineRaw) {
  const day = row.dueDate.toISOString().split("T")[0];
  insuredByDay.set(day, Number(row._sum.payValue ?? 0));
}
```

For all sparklines, fill in zero values for days with no data within the period range, sort by date, then extract just the number array.

**4e. Attach to response KPIs:**
```typescript
paidThisMonth: {
  label: "Pagos no Período",
  value: paidSum,
  count: paidThisMonth._count,
  percentOfPlan,
  delta: computeDelta(paidSum, Number(prevPaid._sum.payValue ?? 0)),
  sparkline: paidSparklineValues,
},
// ... same for dueInPeriod and insuredInPeriod
```

**Why:** Running all 15 queries in `Promise.all` keeps the response time roughly the same (parallel execution). The sparkline queries are lightweight — `findMany` with `select` for paid (typically dozens of rows per month), `groupBy` for insured (even fewer rows).

---

### 5. Redesign KPI cards

**File:** `src/components/dashboard/kpi-cards.tsx`

This is the most visually impactful step.

**5a. Remove from `CardConfig` interface:**
- `color`, `borderColor`, `iconColor` fields — no more colored left borders

**5b. Simplify `CARD_CONFIGS`:**
```typescript
const CARD_CONFIGS: CardConfig[] = [
  { key: "totalPayable", icon: DollarSign },
  { key: "overdue", icon: AlertTriangle },
  { key: "dueSoon", icon: Clock },
  { key: "paidThisMonth", icon: CheckCircle },
  { key: "dueInPeriod", icon: CalendarClock },
  { key: "insuredInPeriod", icon: ShieldCheck },
];
```

**5c. Add new imports:**
- `TrendingUp, TrendingDown` from `lucide-react`
- `AreaChart, Area, ResponsiveContainer` from `recharts`

**5d. Create `SparklineChart` sub-component:**
```tsx
function SparklineChart({ data, kpiKey }: { data: number[]; kpiKey: string }) {
  const chartData = data.map((v) => ({ v }));
  const gradientId = `spark-${kpiKey}`;
  return (
    <div className="mt-3 h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke="hsl(var(--primary))"
            fill={`url(#${gradientId})`}
            strokeWidth={1.5}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

Note: `hsl(var(--primary))` works because OKLCH values are valid CSS, and Recharts accepts any CSS color string. However, if OKLCH doesn't resolve correctly in SVG context, use the hex color directly (`#635BFF` light / context-dependent for dark). Test during implementation.

**5e. Create `DeltaBadge` sub-component:**
```tsx
function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return null;
  const isPositive = delta > 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-xs font-medium",
      isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
    )}>
      <Icon className="h-3 w-3" />
      {isPositive ? "+" : ""}{delta}%
    </span>
  );
}
```

**5f. Redesign the card render:**
```tsx
<Card key={config.key} className="rounded-xl shadow-sm">
  <CardContent className="p-6">
    {/* Label row with icon */}
    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
      <Icon className="h-4 w-4" />
      {kpi.label}
    </div>

    {/* Value + delta row */}
    <div className="mt-2 flex items-baseline gap-2">
      <span className="text-3xl font-semibold tracking-tight tabular-nums">
        {formatBRL(kpi.value)}
      </span>
      {kpi.delta !== undefined && <DeltaBadge delta={kpi.delta} />}
    </div>

    {/* Count subtitle */}
    <p className="mt-1 text-sm text-muted-foreground">
      {kpi.count} título{kpi.count !== 1 ? "s" : ""}
    </p>

    {/* Percentage line (paidThisMonth only) */}
    {kpi.percentOfPlan !== undefined && (
      <p className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
        {kpi.percentOfPlan}% do planejado
      </p>
    )}

    {/* Sparkline (period-filtered KPIs only) */}
    {kpi.sparkline && kpi.sparkline.length > 1 && (
      <SparklineChart data={kpi.sparkline} kpiKey={config.key} />
    )}
  </CardContent>
</Card>
```

**5g. Update skeleton to match new layout:**
- Remove `border-l-4 border-l-muted`
- Add `rounded-xl shadow-sm`
- Add sparkline skeleton placeholder for period-filtered cards

**Why:** The Stripe aesthetic removes decorative colored borders in favor of clean white surfaces with subtle shadows. Hierarchy comes from typography weight/size and the sparkline's visual shape. The delta percentage gives immediate context: "is this getting better or worse?"

---

### 6. Restyle charts

**File:** `src/components/dashboard/dashboard-charts.tsx`

**6a. Dark tooltips (most impactful visual change):**

Replace the tooltip styling in all 3 custom tooltip components:
```tsx
// Old:
<div className="rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">

// New — dark in light mode, keep current for dark mode:
<div className="rounded-lg border-0 bg-[#0A2540] px-3 py-2.5 text-sm text-white shadow-xl dark:bg-popover dark:text-popover-foreground dark:border">
```

The dark tooltip (`#0A2540` = Stripe's navy) creates strong contrast against the light page background. In dark mode, we keep the current popover colors since the page is already dark.

Color dots in tooltips should use slightly brighter versions of the chart colors on the dark background.

**6b. Stacked bar chart — rounded corners:**
```tsx
// Change radius from 0 to rounded top corners
<Bar key={status} dataKey={status} stackId="a" fill={STATUS_COLORS[status]} radius={[4, 4, 0, 0]} />
```

Note: Recharts rounds the corners of the topmost bar in the stack by default when using `radius` on individual bars. Only the last (top) bar in the stack should have `radius` to avoid visual artifacts. Handle this by conditionally applying `radius` only to the top status or by rendering bars in a specific order.

**6c. Donut chart — center label:**

Add a `<Label>` component inside the `<Pie>` to show total count in the center:
```tsx
import { Label } from "recharts";

<Pie data={...} innerRadius={60} outerRadius={100} paddingAngle={2}>
  {/* Cells */}
  <Label
    content={({ viewBox }) => {
      const total = charts.statusDistribution.reduce((sum, s) => sum + s.count, 0);
      if (viewBox && "cx" in viewBox && "cy" in viewBox) {
        return (
          <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
            <tspan x={viewBox.cx} dy="-0.5em" className="fill-foreground text-2xl font-bold">
              {total}
            </tspan>
            <tspan x={viewBox.cx} dy="1.5em" className="fill-muted-foreground text-xs">
              títulos
            </tspan>
          </text>
        );
      }
    }}
  />
</Pie>
```

**6d. Horizontal bar chart — background tracks:**

Use Recharts' built-in `background` prop on `<Bar>`:
```tsx
<Bar
  dataKey="total"
  fill="hsl(var(--primary))"
  radius={[0, 4, 4, 0]}
  background={{ fill: "hsl(var(--muted))", radius: 4 }}
/>
```

This renders a light gray track behind each data bar, making the chart look like a set of progress bars — a classic Stripe/Linear pattern.

Change the bar fill from hardcoded `#3b82f6` (blue) to `hsl(var(--primary))` so it uses the new purple accent.

**6e. Update `STATUS_COLORS` map:**
```typescript
const STATUS_COLORS: Record<string, string> = {
  PENDING: "#F59E0B",  // amber (keep)
  APPROVED: "#635BFF", // purple (was blue)
  PAID: "#00D4AA",     // teal (was green)
  OVERDUE: "#DF1B41",  // red (updated)
  REJECTED: "#6b7280", // gray (keep)
  CANCELLED: "#9ca3af", // light gray (keep)
};
```

**6f. Remove CartesianGrid `strokeDasharray`:**
```tsx
// Old:
<CartesianGrid strokeDasharray="3 3" className="stroke-border" />
// New — solid subtle lines:
<CartesianGrid className="stroke-border" strokeOpacity={0.5} />
```

Or remove the grid entirely for a cleaner look (Stripe dashboards often omit grid lines).

**Why:** Dark tooltips are the single most recognizable Stripe visual element. Rounded bars feel softer and more modern. The donut center label eliminates guessing which slice maps to what total. Background tracks provide relative magnitude context without needing the Y-axis.

---

### 7. Polish dashboard layout

**File:** `src/components/dashboard/dashboard-view.tsx`

- Tighten spacing: `space-y-8` → `space-y-6` for a more compact feel
- The existing layout structure (snapshot KPIs → period selector → period KPIs → charts) is already good — no structural changes needed

---

### 8. Style period selector

**File:** `src/components/dashboard/period-selector.tsx`

- Active preset `Badge` already uses `variant="default"` which will now render as purple (since we changed `--primary`). No code change needed — the palette change handles this automatically.
- Verify that the Calendar picker buttons look good with the new purple primary. The `Calendar` component from shadcn uses `primary` for the selected date, so it should automatically pick up the purple accent.

---

## Files changed

| File | Change |
|---|---|
| `src/app/layout.tsx` | Switch from Geist to Inter font |
| `src/app/globals.css` | New Stripe-inspired color palette (bg, primary, destructive, radius, chart colors) — light + dark |
| `src/lib/dashboard/types.ts` | Add `delta?: number` and `sparkline?: number[]` to `KPICard` interface |
| `src/app/api/dashboard/route.ts` | Add 5 new queries for previous-period deltas + sparkline daily data (15 total) |
| `src/components/dashboard/kpi-cards.tsx` | Complete card redesign: clean surfaces, large text, delta badges, sparkline charts |
| `src/components/dashboard/dashboard-charts.tsx` | Dark tooltips, rounded bars, donut center label, horizontal bar tracks, updated colors |
| `src/components/dashboard/dashboard-view.tsx` | Tighter spacing |
| `src/components/dashboard/period-selector.tsx` | Verify palette alignment (may need no code changes) |

**Total: 7-8 files modified, 0 new files, 0 new dependencies.**

## Optional follow-up (out of scope for this PR)

These items from issue #39 can be addressed in a separate PR:
- **Badge pill variant**: `box-shadow: inset 0 0 0 1px` for subtle inset ring on status badges (`badge.tsx`)
- **App sidebar polish**: Sidebar styling alignment with new palette (`app-sidebar.tsx`)
- **Nav-user styling**: Avatar/dropdown refinements (`nav-user.tsx`)
- **Theme toggle**: Ensure Sun/Moon icons work with new palette (`theme-toggle.tsx`)

## Verification

1. `npx tsc --noEmit` — zero TypeScript errors
2. Dev server visual checks:
   - [ ] Inter font renders correctly on all pages (dashboard, payables, suppliers, login)
   - [ ] Light mode: page background is light blue-gray, cards are white, primary buttons are purple
   - [ ] Dark mode: dark navy background, brighter purple accent, all text readable with good contrast
   - [ ] KPI snapshot cards (3): clean white surface, large R$ value, muted icon+label, no delta/sparkline
   - [ ] KPI period cards (3): same as above PLUS delta % badge (green up or red down) and sparkline area chart
   - [ ] Sparklines render as smooth gradient-filled mini area charts at the bottom of cards
   - [ ] Stacked bar chart: rounded top corners, updated colors, dark tooltip on hover
   - [ ] Donut chart: total count displayed centered in the donut hole
   - [ ] Horizontal bar: light gray tracks behind each bar, purple data bar
   - [ ] Period selector: active preset badge uses purple accent
   - [ ] Payables table page still looks good with new palette (primary buttons are purple, badges work)
   - [ ] Supplier pages still look good
3. Edge cases:
   - [ ] Dashboard with no data (empty period): sparklines return empty array, delta shows 0%, no crashes
   - [ ] Previous period with zero values: delta shows +100% (not NaN or Infinity)
   - [ ] Single-day period: sparkline has 1 data point, renders as a flat line or single dot
   - [ ] Very long period (30+ days): sparkline has enough points for a smooth curve
   - [ ] Stale API response (before server restart): KPI cards handle missing delta/sparkline fields gracefully via optional chaining
