# Plan: Aging Cards — Clickable Drill-Down + Trend Deltas (#92)

## Context
The 3 aging overview cards ("Média de Atraso", "Juros/Multa Acumulados", "Críticos 90+ dias") show important overdue metrics but are static — no click interaction, no trend context. All other dashboard elements (KPI cards, all 4 charts, weekly calendar) already support drill-down. This makes the aging cards the last non-interactive section.

## Approach
Follow the established drill-down pattern: click a card → build a `DrillDownFilter` → call `onDrillDown()`. Add optional `sort`/`sortOrder` fields to `DrillDownFilter` so each card can specify a meaningful initial sort (e.g., "Média de Atraso" → sort by daysOverdue desc). Compute previous-period aging metrics using the same `prevRangeEnd` approach as existing KPI deltas — query overdue payables as of the previous period's end date and compare.

**Key design decision:** Aging overview is "always-live" (not period-filtered), so the current values never change when the user changes the period selector. However, the *deltas* will change because the previous-period reference date shifts. This is correct — it answers "is aging getting better or worse compared to X period ago?"

## Steps

### 1. Extend `DrillDownFilter` with optional sort fields
**File:** `src/lib/dashboard/types.ts`
- Add `sort?: string` and `sortOrder?: "asc" | "desc"` to `DrillDownFilter`
- This is backward-compatible — all existing drill-downs omit these fields and the Sheet will fall back to its current defaults
- **Why:** "Média de Atraso" should open sorted by `daysOverdue desc`, "Juros/Multa" by `jurosMulta desc` — without this, every drill-down starts at `dueDate asc`

### 2. Add previous-period fields to `AgingOverview`
**File:** `src/lib/dashboard/types.ts`
- Add `prevAvgDaysOverdue?: number`, `prevInterestExposure?: number`, `prevCriticalCount?: number` to `AgingOverview`
- Optional because the very first period may not have meaningful previous data

### 3. Compute previous-period aging metrics in the API
**File:** `src/app/api/dashboard/route.ts`
- After the current aging `findMany` (line ~479), run a **second query**:
  ```typescript
  const prevOverduePayables = await prisma.payable.findMany({
    where: {
      ...tenantScope,
      status: { in: [...activeStatuses] },
      dueDate: { lt: prevRangeEnd },
    },
    select: { dueDate: true, payValue: true, jurosMulta: true },
  });
  ```
- Process with the same loop, but use `prevRangeEnd.getTime()` as the reference for computing days overdue (instead of `todayMs`)
- Add `prevAvgDaysOverdue`, `prevInterestExposure`, `prevCriticalCount` to the `agingOverview` response object

**Why a second query instead of filtering the current results:** The previous-period query (`dueDate < prevRangeEnd`) is a strict subset of the current query (`dueDate < today`). We could filter in-memory, but a separate query is clearer and lets Prisma optimize. The cost is negligible — it's one `findMany` added to an already-parallel batch.

### 4. Wire drill-down in the orchestrator
**File:** `src/components/dashboard/dashboard-view.tsx`
- Pass `onDrillDown={setDrillDown}` to `<AgingCards>`
- This is a one-line change — same pattern as KPICards and WeeklyCalendar

### 5. Update drill-down sheet to respect initial sort from filter
**File:** `src/components/dashboard/drill-down-sheet.tsx`
- In the `isFilterChange` reset block (line ~184-188), instead of hardcoding:
  ```typescript
  setSortField("dueDate");
  setSortOrder("asc");
  ```
  Change to:
  ```typescript
  setSortField(filter?.sort ?? "dueDate");
  setSortOrder(filter?.sortOrder ?? "asc");
  ```
- This respects the filter's preferred sort while keeping `dueDate asc` as the default for all existing drill-downs that don't specify a sort

### 6. Make aging cards interactive with drill-down, deltas, and pulse
**File:** `src/components/dashboard/aging-cards.tsx`

#### 6a. Update props
- Add `onDrillDown?: (filter: DrillDownFilter) => void` to `AgingCardsProps`
- Import `DrillDownFilter` from types

#### 6b. Hover effect
- Same pattern as KPI cards: when `onDrillDown` is provided, add `cursor-pointer transition-all hover:shadow-md hover:scale-[1.02]` to each `<Card>`

#### 6c. Click handlers
- **"Média de Atraso"** → opens all overdue payables, sorted by daysOverdue desc:
  ```typescript
  onDrillDown({
    title: "Vencidos — por Dias de Atraso",
    overdue: true,
    dueDateFrom: "2020-01-01",
    dueDateTo: todayStr,
    sort: "daysOverdue",
    sortOrder: "desc",
  })
  ```
- **"Juros/Multa Acumulados"** → opens all overdue payables, sorted by jurosMulta desc:
  ```typescript
  onDrillDown({
    title: "Vencidos — por Juros/Multa",
    overdue: true,
    dueDateFrom: "2020-01-01",
    dueDateTo: todayStr,
    sort: "jurosMulta",
    sortOrder: "desc",
  })
  ```
- **"Críticos (90+ dias)"** → overdue payables 90+ days only (same date math as aging bracket click):
  ```typescript
  const todayMs = new Date(todayStr + "T12:00:00").getTime();
  const DAY_MS = 86_400_000;
  const dueDateTo = new Date(todayMs - 91 * DAY_MS).toISOString().split("T")[0];
  onDrillDown({
    title: "Críticos — 90+ dias",
    overdue: true,
    dueDateFrom: "2020-01-01",
    dueDateTo,
    sort: "daysOverdue",
    sortOrder: "desc",
  })
  ```

#### 6d. Inverted delta badges
- Create an `AgingDeltaBadge` component (inside the same file) with **inverted colors**:
  - ↓ decrease = green (aging is improving)
  - ↑ increase = red (aging is worsening)
- Use `computeDelta(current, previous)` logic inline (same formula: `Math.round(((c - p) / p) * 100)`)
- Display next to each metric value
- Show nothing if previous value is 0 or undefined (no meaningful comparison)

#### 6e. Critical card pulse indicator
- When `criticalCount > 0`, add a pulsing red dot next to the "Críticos (90+ dias)" label using the classic Tailwind "notification ping" pattern:
  ```tsx
  {data.criticalCount > 0 && (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
    </span>
  )}
  ```
- Also add `border-red-500/30 dark:border-red-400/20` to the card border when critical > 0

## Files Changed
| File | Change |
|---|---|
| `src/lib/dashboard/types.ts` | Add `sort?`/`sortOrder?` to `DrillDownFilter`, add `prev*` fields to `AgingOverview` |
| `src/app/api/dashboard/route.ts` | Second aging query for previous period, add `prev*` to response |
| `src/components/dashboard/dashboard-view.tsx` | Pass `onDrillDown={setDrillDown}` to `AgingCards` |
| `src/components/dashboard/drill-down-sheet.tsx` | Use `filter.sort`/`filter.sortOrder` as initial sort defaults |
| `src/components/dashboard/aging-cards.tsx` | Click handlers, hover effects, inverted delta badges, pulse indicator |

## Verification
1. `npx tsc --noEmit` — zero errors
2. Visual: hover over each aging card — cursor changes, shadow/scale effect appears
3. Click "Média de Atraso" → drill-down opens with all overdue payables, sorted by days overdue (highest first)
4. Click "Juros/Multa Acumulados" → drill-down opens, sorted by juros/multa (highest first)
5. Click "Críticos (90+ dias)" → drill-down opens with only 90+ day overdue payables
6. Trend deltas show ↑ (red) or ↓ (green) with percentage — inverted from normal KPI badges
7. Critical card shows pulsing red dot and red border when criticalCount > 0
8. Critical card shows normal styling when criticalCount = 0
9. Change period selector → deltas update but current values stay the same
10. Dark mode: verify delta colors, pulse dot, and card borders render correctly
