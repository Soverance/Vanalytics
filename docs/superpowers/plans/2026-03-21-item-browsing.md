# Item Browsing, Discovery & Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tiered category browsing, granular stat filtering, and side-by-side item comparison to the Vanalytics Item Database.

**Architecture:** Hybrid approach — category hierarchy is frontend-only (maps to existing `category` + `skill` API params), stat filtering adds new server-side query params to `GET /api/items`, comparison is frontend-only (fetches existing item detail endpoint). A React context manages comparison state across pages.

**Tech Stack:** .NET 10 / ASP.NET Core (backend), React 19 + TypeScript + Tailwind CSS (frontend), EF Core / LINQ (query building)

**Spec:** `docs/superpowers/specs/2026-03-21-item-browsing-design.md`

---

## File Structure

**Backend (modify):**
- `src/Vanalytics.Api/Controllers/ItemsController.cs` — Add `stats`, `slots`, `flags` query param parsing and dynamic LINQ filters

**Frontend (new):**
- `src/Vanalytics.Web/src/components/economy/CategoryTree.tsx` — Accordion tree for tiered category selection
- `src/Vanalytics.Web/src/components/economy/StatFilterPanel.tsx` — Dynamic "add stat filter" rows
- `src/Vanalytics.Web/src/components/compare/CompareContext.tsx` — React context for comparison item list
- `src/Vanalytics.Web/src/components/compare/CompareTray.tsx` — Fixed bottom bar with collapse/expand and CompareTable
- `src/Vanalytics.Web/src/components/compare/CompareTable.tsx` — Side-by-side stat diff table

**Frontend (modify):**
- `src/Vanalytics.Web/src/components/economy/ItemCard.tsx` — Add compare checkbox overlay
- `src/Vanalytics.Web/src/pages/ItemDatabasePage.tsx` — Replace category dropdown with CategoryTree, add StatFilterPanel, wire new params
- `src/Vanalytics.Web/src/pages/ItemDetailPage.tsx` — Add "Add to Compare" button
- `src/Vanalytics.Web/src/components/Layout.tsx` — Wrap with CompareContext, render CompareTray
- `src/Vanalytics.Web/src/types/api.ts` — Add StatFilter type

---

### Task 1: Backend — Stat/Slots/Flags Filtering on ItemsController

Add `stats`, `slots`, and `flags` query parameters to the existing `GET /api/items` search endpoint. Uses dynamic LINQ Where clauses built from a static allowlist mapping stat names to GameItem property expressions.

**Files:**
- Modify: `src/Vanalytics.Api/Controllers/ItemsController.cs`

- [ ] **Step 1: Add the stat filter allowlist and slot/flag bitmask maps**

Add these static dictionaries after the existing `GetJobBitmask` method at the bottom of `ItemsController`:

```csharp
// Maps stat name → EF Core-compatible Expression for building Where clauses.
// We need expressions (not Func) so EF Core can translate to SQL.
private static readonly Dictionary<string, Expression<Func<GameItem, int?>>> StatExpressions = new(StringComparer.OrdinalIgnoreCase)
{
    ["HP"] = i => i.HP, ["MP"] = i => i.MP,
    ["STR"] = i => i.STR, ["DEX"] = i => i.DEX, ["VIT"] = i => i.VIT,
    ["AGI"] = i => i.AGI, ["INT"] = i => i.INT, ["MND"] = i => i.MND, ["CHR"] = i => i.CHR,
    ["Damage"] = i => i.Damage, ["Delay"] = i => i.Delay, ["DEF"] = i => i.DEF,
    ["Accuracy"] = i => i.Accuracy, ["Attack"] = i => i.Attack,
    ["RangedAccuracy"] = i => i.RangedAccuracy, ["RangedAttack"] = i => i.RangedAttack,
    ["MagicAccuracy"] = i => i.MagicAccuracy, ["MagicDamage"] = i => i.MagicDamage,
    ["MagicEvasion"] = i => i.MagicEvasion, ["Evasion"] = i => i.Evasion,
    ["Enmity"] = i => i.Enmity, ["Haste"] = i => i.Haste,
    ["StoreTP"] = i => i.StoreTP, ["TPBonus"] = i => i.TPBonus,
    ["PhysicalDamageTaken"] = i => i.PhysicalDamageTaken,
    ["MagicDamageTaken"] = i => i.MagicDamageTaken,
};

// Slot name → bitmask value. Ear and Ring are compound (OR of left+right).
private static readonly Dictionary<string, int> SlotBitmasks = new(StringComparer.OrdinalIgnoreCase)
{
    ["Main"] = 0x0001, ["Sub"] = 0x0002, ["Range"] = 0x0004, ["Ammo"] = 0x0008,
    ["Head"] = 0x0010, ["Body"] = 0x0020, ["Hands"] = 0x0040, ["Legs"] = 0x0080,
    ["Feet"] = 0x0100, ["Neck"] = 0x0200, ["Waist"] = 0x0400,
    ["Ear"] = 0x1800,   // EarL (0x0800) | EarR (0x1000)
    ["Ring"] = 0x6000,  // RingL (0x2000) | RingR (0x4000)
    ["Back"] = 0x8000,
};

private static readonly Dictionary<string, int> FlagBitmasks = new(StringComparer.OrdinalIgnoreCase)
{
    ["rare"] = 32,
    ["exclusive"] = 8192,
    ["auctionable"] = 32768,
};
```

**Important:** You'll also need to add `using System.Linq.Expressions;` at the top of the file.

- [ ] **Step 2: Add a helper method to build stat filter expressions**

Add this method to `ItemsController`, below the dictionaries:

```csharp
/// <summary>
/// Builds a Where expression for a single stat filter: item.{Stat} != null && item.{Stat} >= min && item.{Stat} <= max.
/// </summary>
private static Expression<Func<GameItem, bool>> BuildStatFilter(
    Expression<Func<GameItem, int?>> statExpr, int? min, int? max)
{
    var param = statExpr.Parameters[0];
    var body = statExpr.Body;

    // Start with: stat != null
    Expression filter = Expression.NotEqual(body, Expression.Constant(null, typeof(int?)));

    if (min.HasValue)
        filter = Expression.AndAlso(filter,
            Expression.GreaterThanOrEqual(body, Expression.Constant((int?)min.Value, typeof(int?))));

    if (max.HasValue)
        filter = Expression.AndAlso(filter,
            Expression.LessThanOrEqual(body, Expression.Constant((int?)max.Value, typeof(int?))));

    return Expression.Lambda<Func<GameItem, bool>>(filter, param);
}
```

- [ ] **Step 3: Add new query parameters to the Search method and wire up filtering**

Update the `Search` method signature to include the new parameters, and add the filter logic after the existing filters (after the `jobs` filter, before `var totalCount`):

Change the method signature from:

```csharp
public async Task<IActionResult> Search(
    [FromQuery] string? q = null,
    [FromQuery] string? category = null,
    [FromQuery] int? skill = null,
    [FromQuery] int? minLevel = null,
    [FromQuery] int? maxLevel = null,
    [FromQuery] string? jobs = null,
    [FromQuery] int page = 1,
    [FromQuery] int pageSize = 25)
```

To:

```csharp
public async Task<IActionResult> Search(
    [FromQuery] string? q = null,
    [FromQuery] string? category = null,
    [FromQuery] int? skill = null,
    [FromQuery] int? minLevel = null,
    [FromQuery] int? maxLevel = null,
    [FromQuery] string? jobs = null,
    [FromQuery(Name = "stats")] string[]? stats = null,
    [FromQuery] string? slots = null,
    [FromQuery] string? flags = null,
    [FromQuery] int page = 1,
    [FromQuery] int pageSize = 25)
```

Then add this filtering block after the `jobs` filter (after line 55, before `var totalCount`):

```csharp
// Stat filters: stats=STR:10:&stats=DEF::50
if (stats is { Length: > 0 })
{
    foreach (var stat in stats)
    {
        var parts = stat.Split(':');
        if (parts.Length < 2)
            return BadRequest(new { message = $"Invalid stat filter format: '{stat}'. Expected 'StatName:Min:Max'." });

        var statName = parts[0];
        if (!StatExpressions.TryGetValue(statName, out var statExpr))
            return BadRequest(new { message = $"Unknown stat name: '{statName}'." });

        int? min = parts.Length > 1 && int.TryParse(parts[1], out var mn) ? mn : null;
        int? max = parts.Length > 2 && int.TryParse(parts[2], out var mx) ? mx : null;

        if (!min.HasValue && !max.HasValue) continue;

        query = query.Where(BuildStatFilter(statExpr, min, max));
    }
}

// Slots filter: slots=Head,Body (OR'd bitmask)
if (!string.IsNullOrEmpty(slots))
{
    int slotMask = 0;
    foreach (var slotName in slots.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
    {
        if (!SlotBitmasks.TryGetValue(slotName, out var bit))
            return BadRequest(new { message = $"Unknown slot name: '{slotName}'." });
        slotMask |= bit;
    }
    if (slotMask != 0)
        query = query.Where(i => i.Slots != null && (i.Slots.Value & slotMask) != 0);
}

// Flags filter: flags=rare,exclusive
if (!string.IsNullOrEmpty(flags))
{
    foreach (var flagName in flags.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
    {
        if (!FlagBitmasks.TryGetValue(flagName, out var flagBit))
            return BadRequest(new { message = $"Unknown flag: '{flagName}'." });
        var bit = flagBit; // capture for closure
        query = query.Where(i => (i.Flags & bit) != 0);
    }
}
```

- [ ] **Step 4: Verify the backend compiles**

Run from the Vanalytics repo root:
```bash
cd /c/Git/soverance/Vanalytics && dotnet build src/Vanalytics.Api/Vanalytics.Api.csproj
```
Expected: Build succeeded with 0 errors.

- [ ] **Step 5: Manual smoke test**

Start the app and test the new parameters:
```bash
# Test stat filter
curl "http://localhost:5000/api/items?stats=STR:10:&category=Weapon&pageSize=5"
# Test slots filter
curl "http://localhost:5000/api/items?slots=Head&pageSize=5"
# Test flags filter
curl "http://localhost:5000/api/items?flags=rare,exclusive&pageSize=5"
# Test invalid stat name returns 400
curl -w "%{http_code}" "http://localhost:5000/api/items?stats=FakeStat:1:"
```

- [ ] **Step 6: Commit**

```bash
git add src/Vanalytics.Api/Controllers/ItemsController.cs
git commit -m "feat(api): add stat, slots, and flags filtering to item search"
```

---

### Task 2: Frontend — CategoryTree Component

Create an accordion tree component that replaces the flat category dropdown. Shows top-level categories that expand to reveal subcategories (weapon types for Weapon, equipment slots for Armor). Pure presentational component — receives filter state via props.

**Files:**
- Create: `src/Vanalytics.Web/src/components/economy/CategoryTree.tsx`

**Context:**
- Existing ItemFilters component at `src/Vanalytics.Web/src/components/economy/ItemFilters.tsx` has `WEAPON_TYPES` and `JOBS` constants — reuse the weapon types data
- The app uses Tailwind CSS with a dark theme (gray-800/900/950 backgrounds, gray-100/200/400 text)
- Category is a string param, skill is a number (weapon type ID), slots is a string (slot name)
- ItemDatabasePage already fetches categories via `GET /api/items/categories` which returns `string[]`

- [ ] **Step 1: Create CategoryTree.tsx**

Create `src/Vanalytics.Web/src/components/economy/CategoryTree.tsx`:

```tsx
import { useState } from 'react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'

interface CategoryTreeProps {
  categories: string[]
  selectedCategory: string
  selectedSkill: string
  selectedSlots: string
  onCategoryChange: (category: string) => void
  onSkillChange: (skill: string) => void
  onSlotsChange: (slots: string) => void
}

const WEAPON_TYPES = [
  { id: 1, name: 'Hand-to-Hand' }, { id: 2, name: 'Dagger' }, { id: 3, name: 'Sword' },
  { id: 4, name: 'Great Sword' }, { id: 5, name: 'Axe' }, { id: 6, name: 'Great Axe' },
  { id: 7, name: 'Scythe' }, { id: 8, name: 'Polearm' }, { id: 9, name: 'Katana' },
  { id: 10, name: 'Great Katana' }, { id: 11, name: 'Club' }, { id: 12, name: 'Staff' },
  { id: 25, name: 'Archery' }, { id: 26, name: 'Marksmanship' },
]

const ARMOR_SLOTS = [
  'Head', 'Body', 'Hands', 'Legs', 'Feet', 'Back', 'Waist', 'Neck', 'Ear', 'Ring',
]

// Categories that have subcategories get expand/collapse behavior
const EXPANDABLE = new Set(['Weapon', 'Armor'])

export default function CategoryTree({
  categories, selectedCategory, selectedSkill, selectedSlots,
  onCategoryChange, onSkillChange, onSlotsChange,
}: CategoryTreeProps) {
  const [expanded, setExpanded] = useState<string | null>(
    selectedCategory && EXPANDABLE.has(selectedCategory) ? selectedCategory : null
  )

  const handleCategoryClick = (cat: string) => {
    if (EXPANDABLE.has(cat)) {
      // Toggle expand; also select the category
      setExpanded(expanded === cat ? null : cat)
      onCategoryChange(cat)
      onSkillChange('')
      onSlotsChange('')
    } else {
      // Leaf category — select it, collapse any expanded
      setExpanded(null)
      onCategoryChange(selectedCategory === cat ? '' : cat)
      onSkillChange('')
      onSlotsChange('')
    }
  }

  const handleSubcategoryClick = (cat: string, subKey: string, subValue: string) => {
    onCategoryChange(cat)
    if (cat === 'Weapon') {
      onSkillChange(selectedSkill === subValue ? '' : subValue)
      onSlotsChange('')
    } else if (cat === 'Armor') {
      onSlotsChange(selectedSlots === subValue ? '' : subValue)
      onSkillChange('')
    }
  }

  const clearAll = () => {
    onCategoryChange('')
    onSkillChange('')
    onSlotsChange('')
    setExpanded(null)
  }

  const hasSelection = selectedCategory !== ''

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Category</span>
        {hasSelection && (
          <button onClick={clearAll} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>
      <div className="max-h-64 overflow-y-auto">
        {categories.map((cat) => {
          const isExpanded = expanded === cat
          const isSelected = selectedCategory === cat
          const isExpandable = EXPANDABLE.has(cat)

          return (
            <div key={cat}>
              <button
                onClick={() => handleCategoryClick(cat)}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left transition-colors ${
                  isSelected && !selectedSkill && !selectedSlots
                    ? 'bg-blue-600/20 text-blue-400'
                    : isSelected
                    ? 'text-blue-300'
                    : 'text-gray-300 hover:bg-gray-700/50'
                }`}
              >
                {isExpandable ? (
                  isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                             : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}
                <span className="truncate">{cat}</span>
              </button>

              {/* Weapon subcategories */}
              {cat === 'Weapon' && isExpanded && (
                <div className="ml-6 border-l border-gray-700 pl-2">
                  {WEAPON_TYPES.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => handleSubcategoryClick('Weapon', 'skill', w.id.toString())}
                      className={`block w-full px-2 py-1 text-xs text-left transition-colors ${
                        selectedSkill === w.id.toString()
                          ? 'bg-blue-600/20 text-blue-400'
                          : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'
                      }`}
                    >
                      {w.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Armor subcategories */}
              {cat === 'Armor' && isExpanded && (
                <div className="ml-6 border-l border-gray-700 pl-2">
                  {ARMOR_SLOTS.map((slot) => (
                    <button
                      key={slot}
                      onClick={() => handleSubcategoryClick('Armor', 'slots', slot)}
                      className={`block w-full px-2 py-1 text-xs text-left transition-colors ${
                        selectedSlots === slot
                          ? 'bg-blue-600/20 text-blue-400'
                          : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /c/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/components/economy/CategoryTree.tsx
git commit -m "feat(ui): add CategoryTree accordion component for tiered category browsing"
```

---

### Task 3: Frontend — StatFilterPanel Component

Create the dynamic stat filter panel. Users click "+ Add Stat Filter" to add rows, each with a stat dropdown (alphabetical, excludes already-used stats), min/max number inputs, and a remove button.

**Files:**
- Create: `src/Vanalytics.Web/src/components/economy/StatFilterPanel.tsx`
- Modify: `src/Vanalytics.Web/src/types/api.ts` — add StatFilter type

- [ ] **Step 1: Add the StatFilter type to api.ts**

Add at the end of `src/Vanalytics.Web/src/types/api.ts`:

```typescript
// Stat filtering
export interface StatFilter {
  stat: string
  min: string
  max: string
}
```

- [ ] **Step 2: Create StatFilterPanel.tsx**

Create `src/Vanalytics.Web/src/components/economy/StatFilterPanel.tsx`:

```tsx
import { Plus, X } from 'lucide-react'
import type { StatFilter } from '../../types/api'

interface StatFilterPanelProps {
  filters: StatFilter[]
  onChange: (filters: StatFilter[]) => void
}

const ALL_STATS = [
  'Accuracy', 'AGI', 'Attack', 'CHR', 'Damage', 'DEF', 'DEX', 'Delay',
  'Enmity', 'Evasion', 'Haste', 'HP', 'INT', 'MagicAccuracy', 'MagicDamage',
  'MagicDamageTaken', 'MagicEvasion', 'MND', 'MP', 'PhysicalDamageTaken',
  'RangedAccuracy', 'RangedAttack', 'STR', 'StoreTP', 'TPBonus', 'VIT',
]

export default function StatFilterPanel({ filters, onChange }: StatFilterPanelProps) {
  const usedStats = new Set(filters.map(f => f.stat))

  const addFilter = () => {
    const available = ALL_STATS.filter(s => !usedStats.has(s))
    if (available.length === 0) return
    onChange([...filters, { stat: available[0], min: '', max: '' }])
  }

  const updateFilter = (index: number, field: keyof StatFilter, value: string) => {
    const updated = filters.map((f, i) => i === index ? { ...f, [field]: value } : f)
    onChange(updated)
  }

  const removeFilter = (index: number) => {
    onChange(filters.filter((_, i) => i !== index))
  }

  const availableFor = (currentStat: string) =>
    ALL_STATS.filter(s => s === currentStat || !usedStats.has(s))

  return (
    <div className="space-y-2">
      {filters.map((filter, index) => (
        <div key={index} className="flex items-center gap-2">
          <select
            value={filter.stat}
            onChange={(e) => updateFilter(index, 'stat', e.target.value)}
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-100 focus:border-blue-500 focus:outline-none w-40"
          >
            {availableFor(filter.stat).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span className="text-xs text-gray-500">min</span>
          <input
            type="number"
            value={filter.min}
            onChange={(e) => updateFilter(index, 'min', e.target.value)}
            placeholder="—"
            className="w-16 rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-100 text-center focus:border-blue-500 focus:outline-none"
          />
          <span className="text-xs text-gray-500">max</span>
          <input
            type="number"
            value={filter.max}
            onChange={(e) => updateFilter(index, 'max', e.target.value)}
            placeholder="—"
            className="w-16 rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-100 text-center focus:border-blue-500 focus:outline-none"
          />
          <button onClick={() => removeFilter(index)} className="text-red-400 hover:text-red-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {usedStats.size < ALL_STATS.length && (
        <button
          onClick={addFilter}
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
        >
          <Plus className="h-3.5 w-3.5" /> Add Stat Filter
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /c/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/Vanalytics.Web/src/types/api.ts src/Vanalytics.Web/src/components/economy/StatFilterPanel.tsx
git commit -m "feat(ui): add StatFilterPanel for dynamic stat range filtering"
```

---

### Task 4: Frontend — Wire CategoryTree and StatFilterPanel into ItemDatabasePage

Replace the ItemFilters dropdown with CategoryTree, add StatFilterPanel, and wire the new `stats` and `slots` params into the API fetch call.

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/ItemDatabasePage.tsx`

**Context:**
- Current page at `src/Vanalytics.Web/src/pages/ItemDatabasePage.tsx` uses `ItemFilters` component with `category`, `job`, `skill`, `minLevel`, `maxLevel` state
- ItemFilters will be replaced by CategoryTree + remaining job/level filters inline + StatFilterPanel
- New `slots` state for Armor subcategory, new `statFilters` state for stat filtering
- The API call must serialize `statFilters` as repeatable `stats` query params

- [ ] **Step 1: Rewrite ItemDatabasePage.tsx**

Replace the full contents of `src/Vanalytics.Web/src/pages/ItemDatabasePage.tsx`:

```tsx
import { useState, useEffect } from 'react'
import type { ItemSearchResult, StatFilter } from '../types/api'
import ItemSearchBar from '../components/economy/ItemSearchBar'
import CategoryTree from '../components/economy/CategoryTree'
import StatFilterPanel from '../components/economy/StatFilterPanel'
import ItemCard from '../components/economy/ItemCard'

const JOBS = [
  'WAR', 'MNK', 'WHM', 'BLM', 'RDM', 'THF', 'PLD', 'DRK', 'BST', 'BRD', 'RNG',
  'SAM', 'NIN', 'DRG', 'SMN', 'BLU', 'COR', 'PUP', 'DNC', 'SCH', 'GEO', 'RUN',
]

export default function ItemDatabasePage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [job, setJob] = useState('')
  const [skill, setSkill] = useState('')
  const [slots, setSlots] = useState('')
  const [minLevel, setMinLevel] = useState('')
  const [maxLevel, setMaxLevel] = useState('')
  const [statFilters, setStatFilters] = useState<StatFilter[]>([])
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<ItemSearchResult | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/items/categories')
      .then((r) => r.ok ? r.json() : [])
      .then(setCategories)
      .catch(() => {})
  }, [])

  useEffect(() => {
    setPage(1)
  }, [query, category, job, skill, slots, minLevel, maxLevel, statFilters])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (category) params.set('category', category)
    if (job) params.set('jobs', job)
    if (skill) params.set('skill', skill)
    if (slots) params.set('slots', slots)
    if (minLevel) params.set('minLevel', minLevel)
    if (maxLevel) params.set('maxLevel', maxLevel)

    // Serialize stat filters as repeatable params: stats=STR:10:&stats=DEF::50
    for (const sf of statFilters) {
      if (sf.min || sf.max) {
        params.append('stats', `${sf.stat}:${sf.min}:${sf.max}`)
      }
    }

    params.set('page', page.toString())
    params.set('pageSize', '25')

    fetch(`/api/items?${params}`)
      .then((r) => r.json())
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false))
  }, [query, category, job, skill, slots, minLevel, maxLevel, statFilters, page])

  const totalPages = result ? Math.ceil(result.totalCount / result.pageSize) : 1

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Item Database</h1>
      <p className="text-sm text-gray-500 mb-6">
        Browse {result?.totalCount?.toLocaleString() ?? '...'} items from Vana'diel
      </p>

      <div className="grid gap-4 lg:grid-cols-4 mb-6">
        {/* Left column: Category tree */}
        <div className="lg:col-span-1 space-y-4">
          <CategoryTree
            categories={categories}
            selectedCategory={category}
            selectedSkill={skill}
            selectedSlots={slots}
            onCategoryChange={setCategory}
            onSkillChange={setSkill}
            onSlotsChange={setSlots}
          />
        </div>

        {/* Right column: Search + filters + results */}
        <div className="lg:col-span-3">
          <div className="space-y-3 mb-4">
            <ItemSearchBar value={query} onChange={setQuery} />

            {/* Inline filters: job + level range */}
            <div className="flex flex-wrap gap-3">
              <select
                value={job}
                onChange={(e) => setJob(e.target.value)}
                className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="">All Jobs</option>
                {JOBS.map((j) => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
              <input
                type="number"
                placeholder="Min Lv"
                value={minLevel}
                onChange={(e) => setMinLevel(e.target.value)}
                className="w-20 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              />
              <input
                type="number"
                placeholder="Max Lv"
                value={maxLevel}
                onChange={(e) => setMaxLevel(e.target.value)}
                className="w-20 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Stat filters */}
            <StatFilterPanel filters={statFilters} onChange={setStatFilters} />
          </div>

          {loading ? (
            <p className="text-gray-400">Loading items...</p>
          ) : result && result.items.length > 0 ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {result.items.map((item) => (
                  <ItemCard key={item.itemId} item={item} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded px-3 py-1.5 text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-gray-500">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded px-3 py-1.5 text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-500">No items found.</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /c/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/pages/ItemDatabasePage.tsx
git commit -m "feat(ui): integrate CategoryTree and StatFilterPanel into item database page"
```

---

### Task 5: Frontend — CompareContext

Create a React context that manages the comparison item list. Persisted in `sessionStorage` so items survive page navigation. Max 4 items.

**Files:**
- Create: `src/Vanalytics.Web/src/components/compare/CompareContext.tsx`

- [ ] **Step 1: Create CompareContext.tsx**

Create `src/Vanalytics.Web/src/components/compare/CompareContext.tsx`:

```tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { GameItemSummary, GameItemDetail } from '../../types/api'

const STORAGE_KEY = 'vanalytics_compare_items'
const MAX_ITEMS = 4

interface CompareContextValue {
  items: GameItemSummary[]
  addItem: (item: GameItemSummary) => void
  removeItem: (itemId: number) => void
  clearItems: () => void
  isSelected: (itemId: number) => boolean
  isFull: boolean
  // Cached full details for the compare table
  details: Map<number, GameItemDetail>
  fetchDetails: () => Promise<void>
}

const CompareContext = createContext<CompareContextValue | null>(null)

export function useCompare() {
  const ctx = useContext(CompareContext)
  if (!ctx) throw new Error('useCompare must be used within CompareProvider')
  return ctx
}

export function CompareProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<GameItemSummary[]>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [details, setDetails] = useState<Map<number, GameItemDetail>>(new Map())

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const addItem = (item: GameItemSummary) => {
    setItems(prev => {
      if (prev.length >= MAX_ITEMS) return prev
      if (prev.some(i => i.itemId === item.itemId)) return prev
      return [...prev, item]
    })
  }

  const removeItem = (itemId: number) => {
    setItems(prev => prev.filter(i => i.itemId !== itemId))
    setDetails(prev => {
      const next = new Map(prev)
      next.delete(itemId)
      return next
    })
  }

  const clearItems = () => {
    setItems([])
    setDetails(new Map())
  }

  const isSelected = (itemId: number) => items.some(i => i.itemId === itemId)

  const fetchDetails = async () => {
    const missing = items.filter(i => !details.has(i.itemId))
    if (missing.length === 0) return

    const results = await Promise.all(
      missing.map(i =>
        fetch(`/api/items/${i.itemId}`)
          .then(r => r.ok ? r.json() as Promise<GameItemDetail> : null)
          .catch(() => null)
      )
    )

    setDetails(prev => {
      const next = new Map(prev)
      results.forEach((detail, idx) => {
        if (detail) next.set(missing[idx].itemId, detail)
      })
      return next
    })
  }

  return (
    <CompareContext.Provider value={{
      items, addItem, removeItem, clearItems, isSelected,
      isFull: items.length >= MAX_ITEMS,
      details, fetchDetails,
    }}>
      {children}
    </CompareContext.Provider>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /c/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/components/compare/CompareContext.tsx
git commit -m "feat(ui): add CompareContext for managing item comparison state"
```

---

### Task 6: Frontend — CompareTable Component

Create the side-by-side stat comparison table. Shows only stats where at least one item has a value. Highlights the best value per row in green.

**Files:**
- Create: `src/Vanalytics.Web/src/components/compare/CompareTable.tsx`

- [ ] **Step 1: Create CompareTable.tsx**

Create `src/Vanalytics.Web/src/components/compare/CompareTable.tsx`:

```tsx
import type { GameItemDetail } from '../../types/api'

interface CompareTableProps {
  items: GameItemDetail[]
}

interface StatDef {
  key: keyof GameItemDetail
  label: string
  lowerIsBetter?: boolean
}

const STAT_SECTIONS: { title: string; stats: StatDef[] }[] = [
  {
    title: 'Equipment',
    stats: [
      { key: 'damage', label: 'Damage' },
      { key: 'delay', label: 'Delay', lowerIsBetter: true },
      { key: 'def', label: 'DEF' },
    ],
  },
  {
    title: 'Attributes',
    stats: [
      { key: 'hp', label: 'HP' }, { key: 'mp', label: 'MP' },
      { key: 'str', label: 'STR' }, { key: 'dex', label: 'DEX' },
      { key: 'vit', label: 'VIT' }, { key: 'agi', label: 'AGI' },
      { key: 'int', label: 'INT' }, { key: 'mnd', label: 'MND' },
      { key: 'chr', label: 'CHR' },
    ],
  },
  {
    title: 'Combat',
    stats: [
      { key: 'accuracy', label: 'Accuracy' }, { key: 'attack', label: 'Attack' },
      { key: 'rangedAccuracy', label: 'R.Acc' }, { key: 'rangedAttack', label: 'R.Atk' },
      { key: 'magicAccuracy', label: 'M.Acc' }, { key: 'magicDamage', label: 'M.Dmg' },
    ],
  },
  {
    title: 'Defensive',
    stats: [
      { key: 'evasion', label: 'Evasion' }, { key: 'magicEvasion', label: 'M.Eva' },
      { key: 'physicalDamageTaken', label: 'PDT', lowerIsBetter: true },
      { key: 'magicDamageTaken', label: 'MDT', lowerIsBetter: true },
    ],
  },
  {
    title: 'Special',
    stats: [
      { key: 'enmity', label: 'Enmity' }, { key: 'haste', label: 'Haste' },
      { key: 'storeTP', label: 'Store TP' }, { key: 'tpBonus', label: 'TP Bonus' },
    ],
  },
]

function getBestIndex(values: (number | null)[], lowerIsBetter: boolean): number | null {
  let bestIdx: number | null = null
  let bestVal: number | null = null
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v == null) continue
    if (bestVal == null ||
        (lowerIsBetter ? v < bestVal : v > bestVal)) {
      bestVal = v
      bestIdx = i
    }
  }
  // Only highlight if more than one item has a value (otherwise no comparison)
  const nonNull = values.filter(v => v != null).length
  return nonNull > 1 ? bestIdx : null
}

export default function CompareTable({ items }: CompareTableProps) {
  if (items.length === 0) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left p-2 text-gray-500 font-normal w-28">Stat</th>
            {items.map(item => (
              <th key={item.itemId} className="p-2 text-center min-w-[120px]">
                <div className="flex flex-col items-center gap-1">
                  {item.iconPath ? (
                    <img src={`/item-images/${item.iconPath}`} alt="" className="h-8 w-8" />
                  ) : (
                    <div className="h-8 w-8 rounded bg-gray-800" />
                  )}
                  <span className="text-gray-200 font-medium text-xs">{item.name}</span>
                  <span className="text-gray-500 text-[10px]">
                    {item.category}{item.level ? ` / Lv${item.level}` : ''}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STAT_SECTIONS.map(section => {
            // Only show stats where at least one item has a value
            const visibleStats = section.stats.filter(sd =>
              items.some(item => (item[sd.key] as number | null) != null)
            )
            if (visibleStats.length === 0) return null

            return (
              <Fragment key={section.title}>
                <tr>
                  <td colSpan={items.length + 1} className="pt-3 pb-1 px-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                      {section.title}
                    </span>
                  </td>
                </tr>
                {visibleStats.map(sd => {
                  const values = items.map(item => item[sd.key] as number | null)
                  const bestIdx = getBestIndex(values, sd.lowerIsBetter ?? false)

                  return (
                    <tr key={sd.key} className="border-t border-gray-800/50">
                      <td className="p-2 text-gray-400">{sd.label}</td>
                      {values.map((val, idx) => (
                        <td
                          key={items[idx].itemId}
                          className={`p-2 text-center ${
                            bestIdx === idx
                              ? 'text-green-400 font-semibold'
                              : val != null ? 'text-gray-200' : 'text-gray-600'
                          }`}
                        >
                          {val != null ? (
                            <>
                              {val > 0 ? `+${val}` : val}
                              {bestIdx === idx && ' ▲'}
                            </>
                          ) : '—'}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

**Important:** Add `import { Fragment } from 'react'` at the top of the file.

- [ ] **Step 2: Verify it compiles**

```bash
cd /c/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/components/compare/CompareTable.tsx
git commit -m "feat(ui): add CompareTable for side-by-side item stat comparison"
```

---

### Task 7: Frontend — CompareTray Component

Create the fixed bottom tray that shows selected items and expands to reveal the CompareTable. Visible only when items are in the compare list.

**Files:**
- Create: `src/Vanalytics.Web/src/components/compare/CompareTray.tsx`

- [ ] **Step 1: Create CompareTray.tsx**

Create `src/Vanalytics.Web/src/components/compare/CompareTray.tsx`:

```tsx
import { useState } from 'react'
import { X, ChevronUp, ChevronDown } from 'lucide-react'
import { useCompare } from './CompareContext'
import CompareTable from './CompareTable'

export default function CompareTray() {
  const { items, removeItem, clearItems, details, fetchDetails } = useCompare()
  const [expanded, setExpanded] = useState(false)

  if (items.length === 0) return null

  const handleExpand = async () => {
    if (!expanded) {
      await fetchDetails()
    }
    setExpanded(!expanded)
  }

  const detailItems = items
    .map(i => details.get(i.itemId))
    .filter((d): d is NonNullable<typeof d> => d != null)

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* Expanded comparison table */}
      {expanded && detailItems.length >= 2 && (
        <div className="bg-gray-900 border-t border-gray-700 max-h-[60vh] overflow-y-auto">
          <div className="max-w-5xl mx-auto p-4">
            <CompareTable items={detailItems} />
          </div>
        </div>
      )}

      {/* Tray bar */}
      <div className="bg-gray-900 border-t-2 border-blue-500 px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs text-gray-400 shrink-0">Compare:</span>
          <div className="flex gap-2 overflow-x-auto">
            {items.map(item => (
              <div key={item.itemId} className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded px-2 py-1 shrink-0">
                {item.iconPath ? (
                  <img src={`/item-images/${item.iconPath}`} alt="" className="h-5 w-5" />
                ) : (
                  <div className="h-5 w-5 rounded bg-gray-700" />
                )}
                <span className="text-xs text-gray-200 max-w-[80px] truncate">{item.name}</span>
                <button onClick={() => removeItem(item.itemId)} className="text-red-400 hover:text-red-300">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {/* Empty slots */}
            {Array.from({ length: 4 - items.length }).map((_, i) => (
              <div key={`empty-${i}`} className="h-8 w-20 border border-dashed border-gray-700 rounded shrink-0" />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExpand}
            disabled={items.length < 2}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-3 py-1.5 rounded transition-colors"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            Compare ({items.length})
          </button>
          <button onClick={clearItems} className="text-xs text-gray-500 hover:text-gray-300">
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /c/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/components/compare/CompareTray.tsx
git commit -m "feat(ui): add CompareTray fixed bottom bar with expand/collapse comparison view"
```

---

### Task 8: Frontend — Add Compare Checkbox to ItemCard and "Add to Compare" to ItemDetailPage

Add comparison entry points: a checkbox overlay on ItemCard in search results, and an "Add to Compare" button on the item detail page header.

**Files:**
- Modify: `src/Vanalytics.Web/src/components/economy/ItemCard.tsx`
- Modify: `src/Vanalytics.Web/src/pages/ItemDetailPage.tsx`

- [ ] **Step 1: Update ItemCard.tsx to include compare checkbox**

Replace the full contents of `src/Vanalytics.Web/src/components/economy/ItemCard.tsx`:

```tsx
import { Link } from 'react-router-dom'
import type { GameItemSummary } from '../../types/api'
import { useCompare } from '../compare/CompareContext'

export default function ItemCard({ item }: { item: GameItemSummary }) {
  const { addItem, removeItem, isSelected, isFull } = useCompare()
  const selected = isSelected(item.itemId)
  const disabled = !selected && isFull

  const handleCompareClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (selected) {
      removeItem(item.itemId)
    } else if (!disabled) {
      addItem(item)
    }
  }

  return (
    <div className="relative group">
      <Link
        to={`/items/${item.itemId}`}
        className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 p-3 hover:border-gray-700 transition-colors"
      >
        {item.iconPath ? (
          <img src={`/item-images/${item.iconPath}`} alt="" className="h-8 w-8 shrink-0" />
        ) : (
          <div className="h-8 w-8 shrink-0 rounded bg-gray-800" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-200 truncate">{item.name}</p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{item.category}</span>
            {item.level && <span>Lv.{item.level}</span>}
            {item.isRare && <span className="text-amber-500">Rare</span>}
            {item.isExclusive && <span className="text-red-400">Ex</span>}
          </div>
        </div>
      </Link>

      {/* Compare checkbox */}
      <button
        onClick={handleCompareClick}
        disabled={disabled}
        title={selected ? 'Remove from compare' : disabled ? 'Compare list full (4 max)' : 'Add to compare'}
        className={`absolute top-2 right-2 h-5 w-5 rounded border flex items-center justify-center transition-all ${
          selected
            ? 'bg-blue-600 border-blue-500 text-white'
            : disabled
            ? 'border-gray-700 bg-gray-800 opacity-30 cursor-not-allowed'
            : 'border-gray-600 bg-gray-800 text-transparent hover:border-blue-500 group-hover:text-gray-500'
        }`}
      >
        {selected && <span className="text-xs">✓</span>}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Add "Add to Compare" button to ItemDetailPage header**

In `src/Vanalytics.Web/src/pages/ItemDetailPage.tsx`, add the import and the button.

Add this import at the top (after the existing imports):

```typescript
import { useCompare } from '../components/compare/CompareContext'
```

Then inside the component function, after `const [bazaarListings, setBazaarListings] = ...` line, add:

```typescript
const { addItem, removeItem, isSelected, isFull } = useCompare()
```

Then in the header section, after the closing `</div>` of the flex items-center gap-2 div (the one with category, level, Rare, Ex, AH, Stack badges — around line 103), add:

```tsx
          {/* Compare button */}
          <div className="mt-2">
            {item && (
              isSelected(item.itemId) ? (
                <button
                  onClick={() => removeItem(item.itemId)}
                  className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
                >
                  Remove from Compare
                </button>
              ) : (
                <button
                  onClick={() => addItem({
                    itemId: item.itemId, name: item.name, category: item.category,
                    level: item.level, skill: item.skill, stackSize: item.stackSize,
                    iconPath: item.iconPath, isRare: item.isRare, isExclusive: item.isExclusive,
                    isAuctionable: item.isAuctionable,
                  })}
                  disabled={isFull}
                  className="rounded bg-gray-700 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Add to Compare
                </button>
              )
            )}
          </div>
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /c/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/Vanalytics.Web/src/components/economy/ItemCard.tsx src/Vanalytics.Web/src/pages/ItemDetailPage.tsx
git commit -m "feat(ui): add compare checkbox to ItemCard and compare button to ItemDetailPage"
```

---

### Task 9: Frontend — Wire CompareContext and CompareTray into Layout

Wrap the app layout with CompareProvider and render the CompareTray so it's available on all pages.

**Files:**
- Modify: `src/Vanalytics.Web/src/components/Layout.tsx`

- [ ] **Step 1: Add imports and wrap Layout with CompareProvider**

In `src/Vanalytics.Web/src/components/Layout.tsx`:

Add these imports at the top (after the existing imports):

```typescript
import { CompareProvider } from './compare/CompareContext'
import CompareTray from './compare/CompareTray'
```

Then wrap the entire return of the main layout (the `<div className="min-h-screen bg-gray-950 text-gray-100 flex">` block) with CompareProvider and add CompareTray. The updated return for the non-public-page case should be:

```tsx
  return (
    <CompareProvider>
      <div className="min-h-screen bg-gray-950 text-gray-100 flex">
        {/* ... existing sidebar, mobile overlay, main content ... */}
        {/* (keep all existing JSX exactly as-is) */}
      </div>
      <CompareTray />
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
    </CompareProvider>
  )
```

**Key changes:**
1. Wrap the outer `<div>` with `<CompareProvider>` ... `</CompareProvider>`
2. Move the `LoginModal` render inside the `CompareProvider` wrapper
3. Add `<CompareTray />` after the main `<div>` and before the `LoginModal`
4. Add bottom padding to main content so it doesn't get hidden behind the tray — add `pb-16` to the `<main>` element:

Change:
```tsx
<main className="flex-1 overflow-y-auto p-6 lg:p-8">
```
To:
```tsx
<main className="flex-1 overflow-y-auto p-6 lg:p-8 pb-16">
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /c/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/components/Layout.tsx
git commit -m "feat(ui): integrate CompareProvider and CompareTray into app layout"
```

---

### Task 10: Cleanup and Verify

Remove the now-unused ItemFilters component (replaced by CategoryTree + inline filters) and verify the full app builds.

**Files:**
- Delete: `src/Vanalytics.Web/src/components/economy/ItemFilters.tsx`

- [ ] **Step 1: Verify ItemFilters is no longer imported anywhere**

```bash
cd /c/Git/soverance/Vanalytics/src/Vanalytics.Web && grep -r "ItemFilters" src/ --include="*.tsx" --include="*.ts"
```

Expected: No results (ItemDatabasePage was rewritten in Task 4 without importing ItemFilters).

- [ ] **Step 2: Delete ItemFilters.tsx**

```bash
rm src/Vanalytics.Web/src/components/economy/ItemFilters.tsx
```

- [ ] **Step 3: Full build verification**

Backend:
```bash
cd /c/Git/soverance/Vanalytics && dotnet build src/Vanalytics.Api/Vanalytics.Api.csproj
```

Frontend:
```bash
cd /c/Git/soverance/Vanalytics/src/Vanalytics.Web && npx tsc --noEmit && npx vite build
```

Both should succeed with 0 errors.

- [ ] **Step 4: Commit**

```bash
git rm src/Vanalytics.Web/src/components/economy/ItemFilters.tsx
git commit -m "chore: remove unused ItemFilters component (replaced by CategoryTree)"
```
