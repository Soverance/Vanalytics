# Session Analytics Report Page

**Date:** 2026-03-26
**Status:** Approved

## Overview

Replace the existing session detail modal with a dedicated full-page analytics report at `/sessions/:id`. The report has three tabs, each targeting a distinct analytical lens: post-session debrief, combat optimization, and farming progress tracking. A persistent header strip provides at-a-glance stats and navigation back to the character detail page.

This design also introduces a `CriticalHit` event type to the session parser and API, and a new cross-session trends endpoint for the farming tab.

---

## Page Structure & Navigation

**Route:** `/sessions/:id`

**Header strip (always visible, not tabbed):**
- Breadcrumb: `Character Name > Sessions > Zone Name — Date`
  - "Character Name" links back to `/characters/:id?tab=Sessions`
- Session metadata: start/end time, total duration, status badge (Completed / Active / Abandoned)
- Compact stat row: Total Damage | DPS Avg | Mobs Killed | Gil Earned | Items Dropped | Healing Done

**Tabs:**
1. **Overview** — Post-session narrative timeline
2. **Combat** — Optimization analysis with per-mob breakdowns
3. **Farming** — Progress tracking with cross-session trends

**Entry point:** `SessionsTab` table rows navigate to `/sessions/:id` instead of opening the modal. The `SessionDetailModal` component is deleted.

**Back navigation:** Breadcrumb link navigates to `/characters/:characterId?tab=Sessions`. Browser back also works since it's a real route.

---

## Tab 1: Overview (Post-Session Debrief)

### Interactive Narrative Timeline

A full-width area chart spanning the session duration. X-axis is time (minutes into session), Y-axis is damage per minute bucket.

**Event markers overlaid on the chart:**
- **Kill markers** along the x-axis — each mob kill, showing farming cadence
- **WS spikes** as labeled peaks — hover to see ability name, damage, and target
- **Item drop markers** below the x-axis — hover to see item name
- **Heal events** as green dots above the damage line — Mug drains, cure spells

**Hover interaction:** Hovering on any time bucket shows a tooltip with everything that happened: damage dealt, damage taken, abilities used, mobs killed, items received.

### Session Event Feed

Below the chart, a condensed chronological log filtered to notable events only. Included event types: `MobKill`, `AbilityDamage`, `CriticalHit`, `SpellDamage`, `ItemDrop`, `ItemLost`, `GilGain`, `GilLoss`, `Healing`, `ExpGain`, `LimitGain`, `CapacityGain`, `TreasureHunter`. Excluded: `MeleeDamage`, `RangedDamage`, `Miss`, `Parry`, `AbilityUsed`, `SpellCast` (too high-volume for a highlight feed).

Each entry shows:
- Mob kills: target name, total damage dealt to that mob, time-to-kill
- WS/spell hits: ability name, damage, target
- Item drops: item name, quantity
- Items lost: item name with warning styling
- LP/XP/CP: amount gained
- Healing: amount, ability name

Scrollable list, approximately 10-15 entries visible. Color-coded by event category.

---

## Tab 2: Combat (Optimization Analysis)

### Session-Level Combat Summary

A row of computed stat cards:

| Accuracy | Crit Rate | Parry Rate | Avg TTK | Total WS Damage | WS % of Total |
|----------|-----------|------------|---------|-----------------|---------------|

- **Accuracy** = hits / (hits + Miss events) as a percentage
- **Crit Rate** = CriticalHit events / (CriticalHit + MeleeDamage events)
- **Parry Rate** = Parry events / (Parry + damage received events)
- **Avg TTK** = session duration / mobs killed
- **Total WS Damage** = sum of AbilityDamage values
- **WS % of Total** = AbilityDamage sum / all damage types sum

### Damage Composition

Two side-by-side visualizations:

**Left — Damage by Type:** Horizontal bar chart showing MeleeDamage vs CriticalHit vs AbilityDamage vs SpellDamage vs RangedDamage. Shows damage mix at a glance.

**Right — Top Abilities:** Ranked table of weapon skills and abilities by total damage:

| Ability | Times Used | Total Damage | Avg Damage | % of Total |
|---------|-----------|--------------|------------|------------|

### Per-Mob Breakdown Table

One row per mob type encountered, sortable by any column:

| Mob | Kills | Avg TTK | Accuracy | Crit Rate | Parry Rate | Damage Dealt | Damage Taken | Drops |
|-----|-------|---------|----------|-----------|------------|--------------|--------------|-------|

Per-mob stats are computed by grouping events by their `target` field (for outgoing) and `source` field (for incoming).

---

## Tab 3: Farming (Progress Tracking)

### This Session's Farming Metrics

A row of farming-focused stat cards:

| Gil/Hour | Kills/Hour | Drops/Hour | LP Earned | Items Lost | TH Max |
|----------|------------|------------|-----------|------------|--------|

- **Gil/Hour** = GilGain sum / session hours
- **Kills/Hour** = MobKill count / session hours
- **Drops/Hour** = ItemDrop count / session hours
- **LP Earned** = LimitGain sum
- **Items Lost** = ItemLost event count (highlighted in warning color if nonzero)
- **TH Max** = highest `value` from TreasureHunter events

### Loot Table

Items obtained this session, grouped and summed:

| Item | Quantity | First Drop | Last Drop |
|------|----------|------------|-----------|

Items lost (ItemLost events) shown in a separate section below with warning styling.

### Cross-Session Trends

Requires data from the new trends API endpoint. Shows trend charts across all completed sessions for the same character and zone.

**Three line/area charts (recharts):**
- **Gil/Hour over sessions** — each point is one session, x-axis is session date
- **Kills/Hour over sessions** — same format
- **Drops/Hour over sessions** — same format

**Current session highlighted** as a distinct colored dot on each trend line.

**Comparison callouts** — annotations showing delta from average: "This session: 12,400 gil/hr — Avg: 9,800 gil/hr (+27%)"

---

## API Changes

### Modified Endpoint

**`GET /api/sessions/{id}`** — Extended response with additional computed fields:

```
SessionDetailResponse (extended):
  + limitPointsGained: long
  + accuracy: double          // hits / (hits + misses), 0-1
  + critRate: double          // crits / (crits + normal hits), 0-1
  + parryRate: double         // parries / (parries + damage received), 0-1
```

These are computed server-side from session events to avoid the frontend needing to fetch all events for summary stats.

### New Endpoint

**`GET /api/sessions/trends`** — Cross-session farming metrics.

Query parameters:
- `characterId` (required, Guid)
- `zone` (required, string)

Response: array of per-session summaries, ordered by date ascending:

```json
[
  {
    "sessionId": "guid",
    "date": "2026-03-26T17:09:27Z",
    "durationMinutes": 45,
    "gilPerHour": 12400,
    "killsPerHour": 85,
    "dropsPerHour": 22,
    "totalDamage": 584000,
    "mobsKilled": 64,
    "itemsDropped": 17,
    "limitPoints": 4200
  }
]
```

No pagination — bounded by number of sessions per zone (manageable volume). Only includes sessions with status `Completed`.

### Existing Endpoints (unchanged)

- `GET /api/sessions/{id}/timeline` — time-bucketed aggregations for Overview chart
- `GET /api/sessions/{id}/events` — paginated events for Overview feed and Combat tab aggregations

---

## Parser Change: CriticalHit Event Type

The critical hit pattern in `session.lua` currently emits `MeleeDamage`. Change it to emit `CriticalHit` as a distinct event type so the frontend can compute crit rate.

**session.lua:** Change the critical hit return from `{t='MeleeDamage', ...}` to `{t='CriticalHit', ...}`.

**SessionEventType.cs:** Add `CriticalHit` to the enum.

**SessionsController.cs:** Add `CriticalHit` to the `DamageTypes` array so it counts toward total damage in all existing aggregations (session list, session detail, timeline).

---

## Component Architecture

### New Files

```
src/pages/SessionReportPage.tsx              — Route handler, data fetching, tab state
src/components/session/OverviewTab.tsx       — Narrative timeline chart + event feed
src/components/session/CombatTab.tsx         — Combat summary, damage composition, per-mob table
src/components/session/FarmingTab.tsx        — Farming metrics, loot table, trend charts
```

### Deleted Files

- `src/components/session/SessionDetailModal.tsx`

### Modified Files

- `SessionsTab.tsx` — row click navigates to `/sessions/:id` via `useNavigate`
- `CharacterDetailPage.tsx` — remove modal state, `selectedSessionId`, `SessionDetailModal` import, `onDeleted` handler
- `App.tsx` — add `/sessions/:id` route pointing to `SessionReportPage`
- `session.lua` — critical hit pattern emits `CriticalHit`
- `SessionEventType.cs` — add `CriticalHit`
- `SessionsController.cs` — add `CriticalHit` to `DamageTypes`, add trends endpoint, extend detail response with accuracy/crit/parry rates

### Data Flow

- `SessionReportPage` fetches session detail, timeline, and all events on mount
- Passes relevant data slices to each tab component as props
- Tab components compute their derived metrics (accuracy, per-mob breakdowns, ability rankings) via `useMemo` hooks
- Farming tab triggers an additional fetch to `/api/sessions/trends` when activated (lazy-loaded — heaviest query)

### Navigation Flow

- `SessionsTab` row click: `navigate(/sessions/${s.id})`
- `SessionReportPage` breadcrumb: `navigate(/characters/${characterId}?tab=Sessions)`
- `CharacterDetailPage` reads `?tab=Sessions` query param to restore active tab on return
