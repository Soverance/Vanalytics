# Character Status Panel — Design Spec

## Overview

Add a Status panel to the character detail page that displays calculated character stats (STR, DEX, VIT, etc.) in the FFXI in-game format: `STR  97 +106`, where the first number is the base stat (race + job) and the second is the bonus from equipment + merits. The panel sits side-by-side with the existing Jobs/Crafting tabs, filling the negative space above the equipment grid. Stats update in realtime as players swap gear.

## Page Layout

The section above the equipment grid becomes a two-column layout:

```
┌──────────────────────────┬──────────────────────────┐
│  Jobs | Crafting         │  Base | Combat | Skills   │
│  (existing tabbed panel) │  (new Status panel)       │
│                          │                           │
│  WAR 99  MNK 99  ...    │  HP   1799  +0            │
│                          │  MP    512  +0            │
│                          │  STR    97  +106          │
│                          │  DEX    77  +83           │
│                          │  ...                      │
└──────────────────────────┴──────────────────────────┘
┌─────────────────────────────────────────────────────┐
│  Equipment                                          │
│  [ModelViewer]  [4x4 Grid]                          │
└─────────────────────────────────────────────────────┘
```

Both columns use consistent tab styling. The Status panel shares the same visual language as the Jobs/Crafting tabs (same border, font, active/inactive colors).

## Status Panel Tabs

### Base Tab

Displays HP, MP, and the 7 base attributes in the in-game format:

| Stat | Base | Bonus |
|------|------|-------|
| HP   | 1799 | +0    |
| MP   | 512  | +0    |
| STR  | 97   | +106  |
| DEX  | 77   | +83   |
| VIT  | 82   | +91   |
| AGI  | 51   | +64   |
| INT  | 68   | +72   |
| MND  | 61   | +80   |
| CHR  | 65   | +55   |

- **Base (STR–CHR)** = `raceBase(race, level) + jobStatRankBonus(mainJob, mainLevel) + jobStatRankBonus(subJob, subLevel)`
- **Base (HP/MP)** = `raceHpMpBase(race, level) + jobHpMpRankBonus(mainJob, mainLevel) + jobHpMpRankBonus(subJob, subLevel)` — HP and MP use their own distinct rank tables and growth curves, separate from the seven core stats.
- **Bonus** = `merits[stat] + sum(equippedItem[stat])` for each gear slot. Merit keys: `str`–`chr` for attributes, `max_hp`/`max_mp` for HP/MP.
- `mainLevel` comes from the active job entry (`jobs.find(j => j.isActive).level`)
- `subLevel` = `min(subJobLevel, floor(mainLevel / 2))`
- Master Level stat bonuses are out of scope for the initial implementation — the lookup tables are not well-documented and can be added later.

### Combat Tab

Displays equipment-only stat totals (no base+bonus split):

- Attack, Defense, Accuracy, Evasion
- Ranged Accuracy, Ranged Attack
- Magic Accuracy, Magic Attack (field: `magicDamage`), Magic Evasion
- Enmity, Haste, Store TP

Each row shows the stat label and the total summed from all equipped items. Values use the same color coding as existing stat displays (green for positive, red for negative).

### Skills Tab

Placeholder tab — fully interactive tab that displays a centered "Coming soon — requires addon update" message inside the panel body. Will show combat/magic skill levels once the Windower addon collects that data.

## Stat Calculation

### Static Lookup Module (`src/lib/ffxi-stats.ts`)

A pure TypeScript module containing:

1. **Race base stat tables** — 8 races (Hume M/F, Elvaan M/F, Tarutaru M/F, Mithra, Galka) × 9 stats (HP, MP, STR, DEX, VIT, AGI, INT, MND, CHR). Values sourced from BGWiki.

2. **Job stat rank tables** — 22 jobs × 9 stats. Each cell is a rank (A through G) that determines the stat growth rate per level. HP and MP have their own separate rank tables with different growth curves from the seven core attributes.

3. **Rank-to-bonus lookup** — Given a rank and a level, returns the stat points contributed. Separate lookup functions for core stats (STR–CHR) and HP/MP, as they use different bracket tables.

4. **`calculateBaseStats()` function** — Pure function signature:
   ```typescript
   function calculateBaseStats(
     race: string,
     mainJob: string,
     mainLevel: number,
     subJob: string,
     subLevel: number,
   ): Record<string, number>
   ```
   Returns `{ hp, mp, str, dex, vit, agi, int, mnd, chr }`.

### Equipment Stats

Equipment stats are read from the `GameItemDetail` objects already cached by the equipment hover tooltip system. The item cache (Map of `itemId → GameItemDetail`) is lifted up to `CharacterDetailPage` so both `EquipmentGrid` (for tooltips) and `StatusPanel` (for stat sums) share the same data.

Stat keys on `GameItemDetail` that map to the Combat tab: `attack`, `def`, `accuracy`, `evasion`, `rangedAccuracy`, `rangedAttack`, `magicAccuracy`, `magicDamage`, `magicEvasion`, `enmity`, `haste`, `storeTP`.

Stat keys for Base tab bonus: `hp`, `mp`, `str`, `dex`, `vit`, `agi`, `int`, `mnd`, `chr`.

### Merit Stats

Merit bonuses are read from `character.merits` (type `Record<string, number>`). The relevant keys are: `str`, `dex`, `vit`, `agi`, `int`, `mnd`, `chr`, `max_hp`, `max_mp`. Values represent the actual stat bonus (e.g., `str: 15` means +15 STR).

## Component Structure

### New Files

- **`src/lib/ffxi-stats.ts`** — Static race/job tables and `calculateBaseStats()`. Pure functions, no React dependencies.
- **`src/components/character/StatusPanel.tsx`** — Tabbed panel component with Base | Combat | Skills tabs.

### Modified Files

- **`CharacterDetailPage.tsx`** — Two-column layout for the section above equipment. Lifts item cache state up from EquipmentGrid. Passes cache + character data to StatusPanel.
- **`EquipmentGrid.tsx`** — Receives item cache and a setter as props instead of managing the cache internally. Still handles hover/tooltip positioning.

### No Backend Changes

No new API endpoints, no database schema changes, no backend code modifications. All calculation and display is frontend-only using existing data.

## Data Dependencies

The Status panel needs:
- `character.race`, `character.gender` — for race base stats
- `character.jobs` (find active job) — for main job + level
- `character.subJob`, `character.subJobLevel` — for sub job contribution
- `character.merits` — for merit bonuses
- `itemCache` (shared with EquipmentGrid) — for equipment stat sums
- `localGear` — to know which items are equipped (maps slot → itemId for cache lookup)

All of these are already available on the character detail page.

## Edge Cases

### Optional/Missing Data

Several fields on `CharacterDetail` are optional. Fallback behavior:

- **`race` or `gender` undefined** — Cannot calculate base stats. Display dashes (`—`) for the base column; bonus column still shows equipment + merit totals.
- **`merits` undefined** — Treat all merit bonuses as 0. Bonus column shows equipment-only totals.
- **`subJob` or `subJobLevel` undefined** — Sub job contribution is 0. Base stat only includes race + main job.
- **Active job not found in `jobs` array** — Display dashes for all base stats.

### Loading State

The item cache is populated asynchronously (individual fetches per item). While items are still loading, the Status panel displays dashes (`—`) for equipment bonus values. As each item loads into the cache, the panel recalculates and updates. This is a brief transient state on initial page load.

## Reactivity

When a player swaps gear via the EquipmentSwapModal:
1. `localGear` state updates (already implemented)
2. Item cache fetches the new item's details if not cached
3. StatusPanel recalculates equipment bonus stats from the updated cache + gear
4. Display updates immediately — no API round-trip needed
