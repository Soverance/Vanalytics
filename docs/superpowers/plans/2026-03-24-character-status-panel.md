# Character Status Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Status panel to the character detail page that calculates and displays character stats (base + bonus from equipment/merits) in FFXI's in-game format.

**Architecture:** Frontend-only stat calculation using hardcoded race/job lookup tables sourced from LandSandBoat. The item cache is lifted from EquipmentGrid to CharacterDetailPage so both the equipment tooltips and the Status panel share fetched item data. The Status panel sits in a two-column layout alongside the existing Jobs/Crafting tabs.

**Tech Stack:** React, TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-24-character-status-panel-design.md`

---

### Task 1: Create the FFXI stat calculation module

**Files:**
- Create: `src/Vanalytics.Web/src/lib/ffxi-stats.ts`

This is the core calculation engine — pure TypeScript, no React. Contains all static lookup tables and calculation functions. Data sourced from LandSandBoat's `grades.cpp` and `charutils.cpp`.

- [ ] **Step 1: Create the file with race and job grade tables**

```typescript
// src/Vanalytics.Web/src/lib/ffxi-stats.ts

// Stat grades: 1=A (best) through 7=G (worst), 0=none
// Order: [HP, MP, STR, DEX, VIT, AGI, INT, MND, CHR]

const RACE_GRADES: Record<string, number[]> = {
  Hume:     [4, 4, 4, 4, 4, 4, 4, 4, 4],
  Elvaan:   [3, 5, 2, 5, 3, 6, 6, 2, 4],
  Tarutaru: [7, 1, 6, 4, 5, 3, 1, 5, 4],
  Mithra:   [4, 4, 5, 1, 5, 2, 4, 5, 6],
  Galka:    [1, 7, 3, 4, 1, 5, 5, 4, 6],
}

const JOB_GRADES: Record<string, number[]> = {
  WAR: [2, 0, 1, 3, 4, 3, 6, 6, 5],
  MNK: [1, 0, 3, 2, 1, 6, 7, 4, 5],
  WHM: [5, 3, 4, 6, 4, 5, 5, 1, 3],
  BLM: [6, 2, 6, 3, 6, 3, 1, 5, 4],
  RDM: [4, 4, 4, 4, 5, 5, 3, 3, 4],
  THF: [4, 0, 4, 1, 4, 2, 3, 7, 7],
  PLD: [3, 6, 2, 5, 1, 7, 7, 3, 3],
  DRK: [3, 6, 1, 3, 3, 4, 3, 7, 7],
  BST: [3, 0, 4, 3, 4, 6, 5, 5, 1],
  BRD: [4, 0, 4, 4, 4, 6, 4, 4, 2],
  RNG: [5, 0, 5, 4, 4, 1, 5, 4, 5],
  SAM: [2, 0, 3, 3, 3, 4, 5, 5, 4],
  NIN: [4, 0, 3, 2, 3, 2, 4, 7, 6],
  DRG: [3, 0, 2, 4, 3, 4, 6, 5, 3],
  SMN: [7, 1, 6, 5, 6, 4, 2, 2, 2],
  BLU: [4, 4, 5, 5, 5, 5, 5, 5, 5],
  COR: [4, 0, 5, 3, 5, 2, 3, 5, 5],
  PUP: [4, 0, 5, 2, 4, 3, 5, 6, 3],
  DNC: [4, 0, 4, 3, 5, 2, 6, 6, 2],
  SCH: [5, 4, 6, 4, 5, 4, 3, 4, 3],
  GEO: [3, 2, 6, 4, 5, 4, 3, 3, 4],
  RUN: [3, 6, 3, 4, 5, 2, 4, 4, 6],
}
```

- [ ] **Step 2: Add the scale tables**

```typescript
// HP scale: [base, scaleTo60, scaleOver30, scaleOver60, scaleOver75]
const HP_SCALE: number[][] = [
  [0,  0, 0, 0, 0], // grade 0 (none)
  [19, 9, 1, 3, 3], // grade 1 (A)
  [17, 8, 1, 3, 3], // grade 2 (B)
  [16, 7, 1, 3, 3], // grade 3 (C)
  [14, 6, 0, 3, 3], // grade 4 (D)
  [13, 5, 0, 2, 2], // grade 5 (E)
  [11, 4, 0, 2, 2], // grade 6 (F)
  [10, 3, 0, 2, 2], // grade 7 (G)
]

// MP scale: [base, scaleTo60, scaleOver60]
const MP_SCALE: number[][] = [
  [0,  0,   0],   // grade 0 (none)
  [16, 6,   4],   // grade 1 (A)
  [14, 5,   4],   // grade 2 (B)
  [12, 4,   4],   // grade 3 (C)
  [10, 3,   4],   // grade 4 (D)
  [8,  2,   3],   // grade 5 (E)
  [6,  1,   2],   // grade 6 (F)
  [4,  0.5, 1],   // grade 7 (G)
]

// Stat scale (STR-CHR): [base, scaleTo60, scaleOver60, scaleOver75]
const STAT_SCALE: number[][] = [
  [0, 0,    0,    0],    // grade 0 (none)
  [5, 0.50, 0.10, 0.35], // grade 1 (A)
  [4, 0.45, 0.20, 0.35], // grade 2 (B)
  [4, 0.40, 0.25, 0.35], // grade 3 (C)
  [3, 0.35, 0.35, 0.35], // grade 4 (D)
  [3, 0.30, 0.35, 0.35], // grade 5 (E)
  [2, 0.25, 0.40, 0.35], // grade 6 (F)
  [2, 0.20, 0.40, 0.35], // grade 7 (G)
]
```

- [ ] **Step 3: Add the calculation functions**

```typescript
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

/** Map race string (+ optional gender) to the race key used in RACE_GRADES */
function toRaceKey(race?: string, _gender?: string): string | null {
  if (!race) return null
  // Gender does not affect stats in FFXI — normalize to race name only
  const r = race.replace(/\s*(♂|♀|Male|Female)/i, '').trim()
  // Handle common variants
  if (r.startsWith('Hume')) return 'Hume'
  if (r.startsWith('Elvaan')) return 'Elvaan'
  if (r.startsWith('Taru')) return 'Tarutaru'
  if (r === 'Mithra') return 'Mithra'
  if (r === 'Galka') return 'Galka'
  return null
}

function calcHP(grade: number, level: number): number {
  if (grade === 0 || level <= 0) return 0
  const s = HP_SCALE[grade]
  const lvlUpTo60 = Math.min(level - 1, 59)
  const lvlOver30 = clamp(level - 30, 0, 30)
  const lvlOver60 = clamp(level - 60, 0, 15)
  const lvlOver75 = level >= 75 ? level - 75 : 0
  return s[0] + s[1] * lvlUpTo60 + s[2] * lvlOver30 + s[3] * lvlOver60 + s[4] * lvlOver75
}

function calcSubHP(grade: number, level: number): number {
  if (grade === 0 || level <= 0) return 0
  const s = HP_SCALE[grade]
  const subOver10 = clamp(level - 10, 0, 20)
  const subOver30 = level >= 30 ? level - 30 : 0
  // The bare subOver30 + subOver10 are flat per-level bonuses from LandSandBoat charutils.cpp,
  // separate from the scale table's scaleOver30 multiplier. All halved for sub job.
  return Math.floor((s[0] + s[1] * (level - 1) + s[2] * subOver30 + subOver30 + subOver10) / 2)
}

function calcMP(grade: number, level: number): number {
  if (grade === 0 || level <= 0) return 0
  const s = MP_SCALE[grade]
  const lvlUpTo60 = Math.min(level - 1, 59)
  const lvlOver60 = level >= 60 ? level - 60 : 0
  return Math.floor(s[0] + s[1] * lvlUpTo60 + s[2] * lvlOver60)
}

function calcSubMP(grade: number, level: number): number {
  if (grade === 0 || level <= 0) return 0
  const s = MP_SCALE[grade]
  return Math.floor((s[0] + s[1] * (level - 1)) / 2)
}

function calcStat(grade: number, level: number): number {
  if (grade === 0 || level <= 0) return 0
  const s = STAT_SCALE[grade]
  let val = s[0] + s[1] * Math.min(level - 1, 59)
  if (level > 60) val += s[2] * (level - 60)
  if (level > 75) val += s[3] * (level - 75) - 0.01
  return val // floored after summing race + job + sub
}

function calcSubStat(grade: number, level: number): number {
  if (grade === 0 || level <= 0) return 0
  const s = STAT_SCALE[grade]
  return (s[0] + s[1] * (level - 1)) / 2
}
```

- [ ] **Step 4: Add the public `calculateBaseStats` function**

```typescript
export interface BaseStats {
  hp: number
  mp: number
  str: number
  dex: number
  vit: number
  agi: number
  int: number
  mnd: number
  chr: number
}

const STAT_KEYS: (keyof BaseStats)[] = ['hp', 'mp', 'str', 'dex', 'vit', 'agi', 'int', 'mnd', 'chr']

// Index into grade arrays: 0=HP, 1=MP, 2=STR, 3=DEX, 4=VIT, 5=AGI, 6=INT, 7=MND, 8=CHR
const STAT_INDEX: Record<keyof BaseStats, number> = {
  hp: 0, mp: 1, str: 2, dex: 3, vit: 4, agi: 5, int: 6, mnd: 7, chr: 8,
}

export { STAT_KEYS }

export function calculateBaseStats(
  race: string | undefined,
  gender: string | undefined,
  mainJob: string | undefined,
  mainLevel: number,
  subJob: string | undefined,
  subJobLevel: number,
): BaseStats {
  const result: BaseStats = { hp: 0, mp: 0, str: 0, dex: 0, vit: 0, agi: 0, int: 0, mnd: 0, chr: 0 }

  const raceKey = toRaceKey(race, gender)
  if (!raceKey || !mainJob) return result

  const raceGrades = RACE_GRADES[raceKey]
  const jobGrades = JOB_GRADES[mainJob]
  if (!raceGrades || !jobGrades) return result

  const subGrades = subJob ? JOB_GRADES[subJob] : null
  const sLvl = Math.min(subJobLevel, Math.floor(mainLevel / 2))

  // HP — bonus HP is a flat per-level addition from LandSandBoat charutils.cpp:
  // (level-10) for levels 10+ plus (level-50) clamped to 0-10, all multiplied by 2
  const bonusHP = (mainLevel >= 10 ? mainLevel - 10 : 0) + clamp(mainLevel - 50, 0, 10)
  result.hp = calcHP(raceGrades[0], mainLevel) + calcHP(jobGrades[0], mainLevel) + bonusHP * 2
  if (subGrades) result.hp += calcSubHP(subGrades[0], sLvl)

  // MP — special case: if main job has no MP (grade 0), only get race MP if sub job has MP
  const mainHasMP = jobGrades[1] > 0
  const subHasMP = subGrades ? subGrades[1] > 0 : false

  if (mainHasMP) {
    result.mp = calcMP(raceGrades[1], mainLevel) + calcMP(jobGrades[1], mainLevel)
    if (subGrades) result.mp += calcSubMP(subGrades[1], sLvl)
  } else if (subHasMP) {
    // Non-mage main with mage sub: race MP at sub level / 2
    result.mp = Math.floor(calcMP(raceGrades[1], sLvl) / 2)
    if (subGrades) result.mp += calcSubMP(subGrades[1], sLvl)
  }

  // Core stats (STR through CHR, indices 2-8)
  for (let i = 2; i <= 8; i++) {
    const key = STAT_KEYS[i]
    let val = calcStat(raceGrades[i], mainLevel) + calcStat(jobGrades[i], mainLevel)
    if (subGrades) val += calcSubStat(subGrades[i], sLvl)
    result[key] = Math.floor(val)
  }

  return result
}
```

- [ ] **Step 5: Verify the module compiles**

Run: `cd /c/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit src/lib/ffxi-stats.ts`

---

### Task 2: Lift item cache from EquipmentGrid to CharacterDetailPage

**Files:**
- Modify: `src/Vanalytics.Web/src/components/character/EquipmentGrid.tsx`
- Modify: `src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx`

The item cache currently lives inside EquipmentGrid. We lift it up so both the grid (for hover tooltips) and the StatusPanel (for stat sums) can share the same fetched item data.

- [ ] **Step 1: Update EquipmentGrid to accept item cache as props**

Replace the internal cache state and useEffect with props:

```typescript
// EquipmentGrid.tsx — updated props interface
interface EquipmentGridProps {
  gear: GearEntry[]
  onSlotClick: (slotName: string) => void
  itemCache: Map<number, GameItemDetail>
}
```

Remove from EquipmentGrid:
- The `useState` for `itemCache`
- The `useEffect` that fetches items
- The `api` import

Update the function signature to destructure the new prop:
```typescript
export default function EquipmentGrid({ gear, onSlotClick, itemCache }: EquipmentGridProps) {
```

- [ ] **Step 2: Add item cache state and fetching to CharacterDetailPage**

Add imports:
```typescript
import type { CharacterDetail, GearEntry, GameItemSummary, GameItemDetail } from '../types/api'
import { api } from '../api/client'
```

Add state and effect inside the component:
```typescript
const [itemCache, setItemCache] = useState<Map<number, GameItemDetail>>(new Map())

// Pre-fetch item details for all equipped items
useEffect(() => {
  const ids = localGear.filter(g => g.itemId > 0).map(g => g.itemId)
  const uncached = ids.filter(id => !itemCache.has(id))
  if (uncached.length === 0) return

  uncached.forEach(id => {
    api<GameItemDetail>(`/api/items/${id}`)
      .then(item => {
        setItemCache(prev => new Map(prev).set(id, item))
      })
      .catch(() => {})
  })
}, [localGear])
```

Pass the cache to EquipmentGrid:
```tsx
<EquipmentGrid
  gear={localGear}
  onSlotClick={(slot) => setSwapSlot(slot)}
  itemCache={itemCache}
/>
```

- [ ] **Step 3: Verify the app compiles and equipment hover tooltips still work**

Run: `cd /c/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`

---

### Task 3: Create the StatusPanel component

**Files:**
- Create: `src/Vanalytics.Web/src/components/character/StatusPanel.tsx`

- [ ] **Step 1: Create StatusPanel with the Base tab**

```typescript
// src/Vanalytics.Web/src/components/character/StatusPanel.tsx
import { useState } from 'react'
import { calculateBaseStats, STAT_KEYS, type BaseStats } from '../../lib/ffxi-stats'
import type { CharacterDetail, GearEntry, GameItemDetail } from '../../types/api'

type StatusTab = 'Base' | 'Combat' | 'Skills'
const STATUS_TABS: StatusTab[] = ['Base', 'Combat', 'Skills']

// Merit keys that map to base stats
const MERIT_STAT_KEYS: Record<keyof BaseStats, string> = {
  hp: 'max_hp', mp: 'max_mp',
  str: 'str', dex: 'dex', vit: 'vit', agi: 'agi', int: 'int', mnd: 'mnd', chr: 'chr',
}

// Combat stat keys on GameItemDetail with display labels
const COMBAT_STATS: { key: string; label: string }[] = [
  { key: 'attack', label: 'Attack' },
  { key: 'def', label: 'Defense' },
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'evasion', label: 'Evasion' },
  { key: 'rangedAccuracy', label: 'Ranged Acc.' },
  { key: 'rangedAttack', label: 'Ranged Atk.' },
  { key: 'magicAccuracy', label: 'Magic Acc.' },
  { key: 'magicDamage', label: 'Magic Atk.' },
  { key: 'magicEvasion', label: 'Magic Eva.' },
  { key: 'enmity', label: 'Enmity' },
  { key: 'haste', label: 'Haste' },
  { key: 'storeTP', label: 'Store TP' },
]

interface StatusPanelProps {
  character: CharacterDetail
  gear: GearEntry[]
  itemCache: Map<number, GameItemDetail>
}

/** Check whether all equipped items have been loaded into the cache */
function isGearLoaded(gear: GearEntry[], itemCache: Map<number, GameItemDetail>): boolean {
  return gear.every(g => g.itemId <= 0 || itemCache.has(g.itemId))
}

function sumGearStat(gear: GearEntry[], itemCache: Map<number, GameItemDetail>, statKey: string): number {
  let total = 0
  for (const g of gear) {
    if (g.itemId <= 0) continue
    const item = itemCache.get(g.itemId)
    if (!item) continue
    const val = (item as Record<string, unknown>)[statKey]
    if (typeof val === 'number') total += val
  }
  return total
}

export default function StatusPanel({ character, gear, itemCache }: StatusPanelProps) {
  const [activeTab, setActiveTab] = useState<StatusTab>('Base')

  const activeJob = character.jobs.find(j => j.isActive)
  const mainJob = activeJob?.job
  const mainLevel = activeJob?.level ?? 0
  const subJob = character.subJob
  const subLevel = character.subJobLevel ?? 0

  // Can we calculate base stats? Requires race + active job
  const canCalcBase = !!character.race && !!mainJob
  const baseStats = canCalcBase
    ? calculateBaseStats(character.race, character.gender, mainJob, mainLevel, subJob, subLevel)
    : null

  const merits = character.merits ?? {}
  const gearLoaded = isGearLoaded(gear, itemCache)

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-700 mb-4">
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Base' && (
        <div className="space-y-1">
          {STAT_KEYS.map(key => {
            const base = baseStats ? baseStats[key] : null
            const meritVal = merits[MERIT_STAT_KEYS[key]] ?? 0
            const equipVal = gearLoaded ? sumGearStat(gear, itemCache, key) : null
            const bonus = equipVal != null ? meritVal + equipVal : null
            return (
              <div key={key} className="flex items-center text-sm font-mono">
                <span className="w-10 text-gray-400 uppercase">{key}</span>
                <span className="w-16 text-right text-gray-200">
                  {base != null ? base : '—'}
                </span>
                <span className={`w-16 text-right ${bonus != null && bonus > 0 ? 'text-green-400' : bonus != null && bonus < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                  {bonus == null ? '—' : bonus > 0 ? `+${bonus}` : bonus < 0 ? `${bonus}` : '—'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {activeTab === 'Combat' && (
        <div className="space-y-1">
          {!gearLoaded ? (
            <p className="text-sm text-gray-500 text-center py-4">Loading...</p>
          ) : COMBAT_STATS.map(({ key, label }) => {
            const total = sumGearStat(gear, itemCache, key)
            if (total === 0) return null
            return (
              <div key={key} className="flex items-center text-sm font-mono">
                <span className="flex-1 text-gray-400">{label}</span>
                <span className={total > 0 ? 'text-green-400' : 'text-red-400'}>
                  {total > 0 ? `+${total}` : total}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {activeTab === 'Skills' && (
        <p className="text-sm text-gray-500 text-center py-4">
          Coming soon — requires addon update
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify the component compiles**

Run: `cd /c/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`

---

### Task 4: Integrate StatusPanel into CharacterDetailPage

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx`

- [ ] **Step 1: Import StatusPanel**

```typescript
import StatusPanel from '../components/character/StatusPanel'
```

- [ ] **Step 2: Replace the single-column section with two-column layout**

Replace the existing section (lines 92-112) with:

```tsx
<section className="mb-8">
  <div className="flex gap-8">
    {/* Left column: Jobs / Crafting */}
    <div className="flex-1 min-w-0">
      <div className="flex gap-1 border-b border-gray-700 mb-4">
        {STAT_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div>
        {activeTab === 'Jobs' && <JobsGrid jobs={character.jobs} />}
        {activeTab === 'Crafting' && <CraftingTable skills={character.craftingSkills} />}
      </div>
    </div>

    {/* Right column: Status panel */}
    <div className="w-72 flex-shrink-0">
      <StatusPanel
        character={character}
        gear={localGear}
        itemCache={itemCache}
      />
    </div>
  </div>
</section>
```

- [ ] **Step 3: Verify the app compiles and renders correctly**

Run: `cd /c/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit`

Then start the dev server and check the character detail page:
- Two-column layout renders (Jobs/Crafting on left, Status on right)
- Base tab shows stat values with base + bonus columns
- Combat tab shows equipment stat totals
- Skills tab shows placeholder message
- Swapping gear updates stat values in realtime
- Equipment hover tooltips still work
