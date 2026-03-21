# Economy Frontend Implementation Plan (Sub-spec B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build public-facing item database search, item detail pages with price history charts, cross-server comparison, and recent sales tables.

**Architecture:** Public React pages (no auth required) with their own lightweight nav header. Item search with filters, item detail with stats display and recharts-powered price charts. Routes at `/items` and `/items/:id`. Bazaar sections show "Coming soon" placeholders per spec.

**Tech Stack:** React, TypeScript, Tailwind CSS, recharts (charting), existing Vite setup.

**Spec:** `docs/specs/2026-03-21-economy-tracking-design.md` — Sub-spec B

**Depends on:** Plan A1/A2 (Item database + AH API endpoints)

---

## File Structure

```
src/Vanalytics.Web/src/
├── types/
│   └── api.ts                              # MODIFY: add item/economy types
├── components/
│   ├── Layout.tsx                          # MODIFY: handle /items routes as public with nav
│   └── economy/
│       ├── ItemSearchBar.tsx               # CREATE: search input with debounce
│       ├── ItemFilters.tsx                 # CREATE: category, level, job filters
│       ├── ItemCard.tsx                    # CREATE: item result card with icon
│       ├── ItemStatsTable.tsx              # CREATE: full stats display table
│       ├── PriceHistoryChart.tsx           # CREATE: recharts area chart
│       ├── CrossServerChart.tsx            # CREATE: recharts bar chart
│       └── SalesTable.tsx                  # CREATE: paginated recent sales
├── pages/
│   ├── ItemDatabasePage.tsx               # CREATE: /items — search + browse
│   └── ItemDetailPage.tsx                 # CREATE: /items/:id — full detail + prices
└── App.tsx                                 # MODIFY: add /items routes
```

---

### Task 1: Install recharts and Add Economy TypeScript Types

**Files:**
- Modify: `src/Vanalytics.Web/src/types/api.ts`

- [ ] **Step 1: Install recharts**

```bash
cd src/Vanalytics.Web
npm install recharts
```

- [ ] **Step 2: Add economy types to api.ts**

Add these to the end of `src/Vanalytics.Web/src/types/api.ts`:

```typescript
// Items / Economy
export interface GameItemSummary {
  itemId: number
  name: string
  category: string
  level: number | null
  skill: number | null
  stackSize: number
  iconPath: string | null
  isRare: boolean
  isExclusive: boolean
  isAuctionable: boolean
}

export interface GameItemDetail {
  itemId: number
  name: string
  nameJa: string | null
  nameLong: string | null
  description: string | null
  descriptionJa: string | null
  category: string
  type: number
  flags: number
  stackSize: number
  level: number | null
  jobs: number | null
  races: number | null
  slots: number | null
  skill: number | null
  damage: number | null
  delay: number | null
  def: number | null
  hp: number | null
  mp: number | null
  str: number | null
  dex: number | null
  vit: number | null
  agi: number | null
  int: number | null
  mnd: number | null
  chr: number | null
  accuracy: number | null
  attack: number | null
  rangedAccuracy: number | null
  rangedAttack: number | null
  magicAccuracy: number | null
  magicDamage: number | null
  magicEvasion: number | null
  evasion: number | null
  enmity: number | null
  haste: number | null
  storeTP: number | null
  tpBonus: number | null
  physicalDamageTaken: number | null
  magicDamageTaken: number | null
  iconPath: string | null
  previewImagePath: string | null
  isRare: boolean
  isExclusive: boolean
  isAuctionable: boolean
}

export interface ItemSearchResult {
  totalCount: number
  page: number
  pageSize: number
  items: GameItemSummary[]
}

export interface PriceStats {
  median: number
  min: number
  max: number
  average: number
  salesPerDay: number
}

export interface AhSale {
  price: number
  soldAt: string
  sellerName: string
  buyerName: string
  stackSize: number
}

export interface PriceHistoryResponse {
  totalCount: number
  page: number
  pageSize: number
  days: number
  stats: PriceStats | null
  sales: AhSale[]
}

export interface CrossServerPrice {
  server: string
  median: number
  min: number
  max: number
  average: number
  saleCount: number
}

export interface CrossServerResponse {
  days: number
  servers: CrossServerPrice[]
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

---

### Task 2: Item Search Components

**Files:**
- Create: `src/Vanalytics.Web/src/components/economy/ItemSearchBar.tsx`
- Create: `src/Vanalytics.Web/src/components/economy/ItemFilters.tsx`
- Create: `src/Vanalytics.Web/src/components/economy/ItemCard.tsx`

- [ ] **Step 1: Create ItemSearchBar**

```tsx
// src/Vanalytics.Web/src/components/economy/ItemSearchBar.tsx
import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'

interface Props {
  value: string
  onChange: (value: string) => void
}

export default function ItemSearchBar({ value, onChange }: Props) {
  const [input, setInput] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (input !== value) onChange(input)
    }, 300)
    return () => clearTimeout(timer)
  }, [input, value, onChange])

  useEffect(() => { setInput(value) }, [value])

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Search items..."
        className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-10 pr-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
      />
    </div>
  )
}
```

- [ ] **Step 2: Create ItemFilters**

```tsx
// src/Vanalytics.Web/src/components/economy/ItemFilters.tsx
interface Props {
  categories: string[]
  selectedCategory: string
  onCategoryChange: (category: string) => void
  selectedJob: string
  onJobChange: (job: string) => void
  minLevel: string
  maxLevel: string
  onMinLevelChange: (val: string) => void
  onMaxLevelChange: (val: string) => void
  selectedSkill: string
  onSkillChange: (skill: string) => void
}

const JOBS = [
  '', 'WAR', 'MNK', 'WHM', 'BLM', 'RDM', 'THF', 'PLD', 'DRK', 'BST', 'BRD', 'RNG',
  'SAM', 'NIN', 'DRG', 'SMN', 'BLU', 'COR', 'PUP', 'DNC', 'SCH', 'GEO', 'RUN',
]

const WEAPON_TYPES: { id: number; name: string }[] = [
  { id: 1, name: 'Hand-to-Hand' }, { id: 2, name: 'Dagger' }, { id: 3, name: 'Sword' },
  { id: 4, name: 'Great Sword' }, { id: 5, name: 'Axe' }, { id: 6, name: 'Great Axe' },
  { id: 7, name: 'Scythe' }, { id: 8, name: 'Polearm' }, { id: 9, name: 'Katana' },
  { id: 10, name: 'Great Katana' }, { id: 11, name: 'Club' }, { id: 12, name: 'Staff' },
  { id: 25, name: 'Archery' }, { id: 26, name: 'Marksmanship' },
]

export default function ItemFilters({
  categories, selectedCategory, onCategoryChange,
  selectedJob, onJobChange,
  minLevel, maxLevel, onMinLevelChange, onMaxLevelChange,
  selectedSkill, onSkillChange,
}: Props) {
  return (
    <div className="flex flex-wrap gap-3">
      <select
        value={selectedCategory}
        onChange={(e) => onCategoryChange(e.target.value)}
        className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
      >
        <option value="">All Categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      {selectedCategory === 'Weapon' && (
        <select
          value={selectedSkill}
          onChange={(e) => onSkillChange(e.target.value)}
          className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Weapon Types</option>
          {WEAPON_TYPES.map((w) => (
            <option key={w.id} value={w.id.toString()}>{w.name}</option>
          ))}
        </select>
      )}

      <select
        value={selectedJob}
        onChange={(e) => onJobChange(e.target.value)}
        className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
      >
        <option value="">All Jobs</option>
        {JOBS.filter(j => j).map((j) => (
          <option key={j} value={j}>{j}</option>
        ))}
      </select>

      <input
        type="number"
        placeholder="Min Lv"
        value={minLevel}
        onChange={(e) => onMinLevelChange(e.target.value)}
        className="w-20 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
      />
      <input
        type="number"
        placeholder="Max Lv"
        value={maxLevel}
        onChange={(e) => onMaxLevelChange(e.target.value)}
        className="w-20 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
      />
    </div>
  )
}
```

- [ ] **Step 3: Create ItemCard**

```tsx
// src/Vanalytics.Web/src/components/economy/ItemCard.tsx
import { Link } from 'react-router-dom'
import type { GameItemSummary } from '../../types/api'

export default function ItemCard({ item }: { item: GameItemSummary }) {
  return (
    <Link
      to={`/items/${item.itemId}`}
      className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 p-3 hover:border-gray-700 transition-colors"
    >
      {item.iconPath ? (
        <img
          src={`/item-images/${item.iconPath}`}
          alt=""
          className="h-8 w-8 shrink-0"
        />
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
  )
}
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

---

### Task 3: Item Detail Components — Stats Table

**Files:**
- Create: `src/Vanalytics.Web/src/components/economy/ItemStatsTable.tsx`

- [ ] **Step 1: Create ItemStatsTable**

Displays all stats for an item in a clean grid layout.

```tsx
// src/Vanalytics.Web/src/components/economy/ItemStatsTable.tsx
import type { GameItemDetail } from '../../types/api'

// FFXI job bitmask: bit 0 unused, WAR=bit 1, MNK=bit 2, etc.
// Matches Windower Resources items.lua encoding.
const JOB_NAMES: Record<number, string> = {
  1: 'WAR', 2: 'MNK', 3: 'WHM', 4: 'BLM', 5: 'RDM', 6: 'THF',
  7: 'PLD', 8: 'DRK', 9: 'BST', 10: 'BRD', 11: 'RNG', 12: 'SAM',
  13: 'NIN', 14: 'DRG', 15: 'SMN', 16: 'BLU', 17: 'COR', 18: 'PUP',
  19: 'DNC', 20: 'SCH', 21: 'GEO', 22: 'RUN',
}

function decodeJobs(bitmask: number | null): string[] {
  if (!bitmask) return []
  const jobs: string[] = []
  for (let bit = 1; bit <= 22; bit++) {
    if ((bitmask & (1 << bit)) !== 0 && JOB_NAMES[bit]) {
      jobs.push(JOB_NAMES[bit])
    }
  }
  return jobs
}

function StatRow({ label, value, suffix }: { label: string; value: number | null | undefined; suffix?: string }) {
  if (value == null) return null
  const display = value > 0 ? `+${value}` : `${value}`
  return (
    <div className="flex justify-between py-1 border-b border-gray-800 last:border-0">
      <span className="text-gray-400">{label}</span>
      <span className={value > 0 ? 'text-green-400' : value < 0 ? 'text-red-400' : 'text-gray-300'}>
        {display}{suffix}
      </span>
    </div>
  )
}

export default function ItemStatsTable({ item }: { item: GameItemDetail }) {
  const jobs = decodeJobs(item.jobs)

  return (
    <div className="space-y-4">
      {/* Base info */}
      <div className="grid grid-cols-2 gap-x-4 text-sm">
        {item.damage != null && (
          <div className="flex justify-between py-1 border-b border-gray-800">
            <span className="text-gray-400">DMG</span>
            <span className="text-gray-200">{item.damage}</span>
          </div>
        )}
        {item.delay != null && (
          <div className="flex justify-between py-1 border-b border-gray-800">
            <span className="text-gray-400">Delay</span>
            <span className="text-gray-200">{item.delay}</span>
          </div>
        )}
        {item.def != null && (
          <div className="flex justify-between py-1 border-b border-gray-800">
            <span className="text-gray-400">DEF</span>
            <span className="text-gray-200">{item.def}</span>
          </div>
        )}
      </div>

      {/* Main stats */}
      <div className="grid grid-cols-2 gap-x-4 text-sm">
        <StatRow label="HP" value={item.hp} />
        <StatRow label="MP" value={item.mp} />
        <StatRow label="STR" value={item.str} />
        <StatRow label="DEX" value={item.dex} />
        <StatRow label="VIT" value={item.vit} />
        <StatRow label="AGI" value={item.agi} />
        <StatRow label="INT" value={item.int} />
        <StatRow label="MND" value={item.mnd} />
        <StatRow label="CHR" value={item.chr} />
      </div>

      {/* Combat stats */}
      <div className="grid grid-cols-2 gap-x-4 text-sm">
        <StatRow label="Accuracy" value={item.accuracy} />
        <StatRow label="Attack" value={item.attack} />
        <StatRow label="Ranged Acc." value={item.rangedAccuracy} />
        <StatRow label="Ranged Atk." value={item.rangedAttack} />
        <StatRow label="Magic Acc." value={item.magicAccuracy} />
        <StatRow label="Magic Dmg." value={item.magicDamage} />
        <StatRow label="Magic Eva." value={item.magicEvasion} />
        <StatRow label="Evasion" value={item.evasion} />
        <StatRow label="Enmity" value={item.enmity} />
        <StatRow label="Haste" value={item.haste} suffix="%" />
        <StatRow label="Store TP" value={item.storeTP} />
        <StatRow label="TP Bonus" value={item.tpBonus} />
        <StatRow label="Phys. Taken" value={item.physicalDamageTaken} suffix="%" />
        <StatRow label="Magic Taken" value={item.magicDamageTaken} suffix="%" />
      </div>

      {/* Jobs */}
      {jobs.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Equippable by</p>
          <div className="flex flex-wrap gap-1">
            {jobs.map((j) => (
              <span key={j} className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-400">{j}</span>
            ))}
          </div>
        </div>
      )}

      {/* Description (special effects, aftermath, etc.) */}
      {item.description && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Description</p>
          <p className="text-sm text-gray-400 whitespace-pre-line">{item.description}</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

---

### Task 4: Price Charts — History and Cross-Server

**Files:**
- Create: `src/Vanalytics.Web/src/components/economy/PriceHistoryChart.tsx`
- Create: `src/Vanalytics.Web/src/components/economy/CrossServerChart.tsx`

- [ ] **Step 1: Create PriceHistoryChart**

```tsx
// src/Vanalytics.Web/src/components/economy/PriceHistoryChart.tsx
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { AhSale } from '../../types/api'

interface Props {
  sales: AhSale[]
}

export default function PriceHistoryChart({ sales }: Props) {
  if (sales.length === 0) {
    return <p className="text-sm text-gray-500">No price data available.</p>
  }

  const data = [...sales]
    .sort((a, b) => new Date(a.soldAt).getTime() - new Date(b.soldAt).getTime())
    .map((s) => ({
      date: new Date(s.soldAt).toLocaleDateString(),
      price: s.price,
    }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
        />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
          labelStyle={{ color: '#9ca3af' }}
          itemStyle={{ color: '#60a5fa' }}
          formatter={(value: number) => [value.toLocaleString() + ' gil', 'Price']}
        />
        <Area
          type="monotone"
          dataKey="price"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 2: Create CrossServerChart**

```tsx
// src/Vanalytics.Web/src/components/economy/CrossServerChart.tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { CrossServerPrice } from '../../types/api'

interface Props {
  servers: CrossServerPrice[]
}

export default function CrossServerChart({ servers }: Props) {
  if (servers.length === 0) {
    return <p className="text-sm text-gray-500">No cross-server data available.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={servers}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="server"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
          angle={-45}
          textAnchor="end"
          height={60}
        />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
          labelStyle={{ color: '#9ca3af' }}
          formatter={(value: number, name: string) => {
            const label = name === 'median' ? 'Median' : name
            return [value.toLocaleString() + ' gil', label]
          }}
        />
        <Bar dataKey="median" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

---

### Task 5: Sales Table Component

**Files:**
- Create: `src/Vanalytics.Web/src/components/economy/SalesTable.tsx`

- [ ] **Step 1: Create SalesTable with pagination**

```tsx
// src/Vanalytics.Web/src/components/economy/SalesTable.tsx
import type { AhSale } from '../../types/api'

interface Props {
  sales: AhSale[]
  totalCount: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
}

export default function SalesTable({ sales, totalCount, page, pageSize, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  if (sales.length === 0) {
    return <p className="text-sm text-gray-500">No recent sales recorded.</p>
  }

  return (
    <div>
      <div className="rounded border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800/50 text-left text-gray-500">
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Price</th>
              <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Buyer</th>
              <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Seller</th>
              <th className="px-4 py-2.5 font-medium hidden md:table-cell">Qty</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s, i) => (
              <tr key={i} className="border-t border-gray-800">
                <td className="px-4 py-2 text-gray-400">
                  {new Date(s.soldAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-2 text-gray-200 font-medium">
                  {s.price.toLocaleString()} gil
                </td>
                <td className="px-4 py-2 text-gray-400 hidden sm:table-cell">{s.buyerName}</td>
                <td className="px-4 py-2 text-gray-400 hidden sm:table-cell">{s.sellerName}</td>
                <td className="px-4 py-2 text-gray-500 hidden md:table-cell">{s.stackSize}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className="rounded px-3 py-1.5 text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">
            Page {page} of {totalPages} ({totalCount} sales)
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="rounded px-3 py-1.5 text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

---

### Task 6: Item Database Page

**Files:**
- Create: `src/Vanalytics.Web/src/pages/ItemDatabasePage.tsx`

- [ ] **Step 1: Create ItemDatabasePage**

```tsx
// src/Vanalytics.Web/src/pages/ItemDatabasePage.tsx
import { useState, useEffect } from 'react'
import type { GameItemSummary, ItemSearchResult } from '../types/api'
import ItemSearchBar from '../components/economy/ItemSearchBar'
import ItemFilters from '../components/economy/ItemFilters'
import ItemCard from '../components/economy/ItemCard'

export default function ItemDatabasePage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [job, setJob] = useState('')
  const [skill, setSkill] = useState('')
  const [minLevel, setMinLevel] = useState('')
  const [maxLevel, setMaxLevel] = useState('')
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
  }, [query, category, job, skill, minLevel, maxLevel])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (category) params.set('category', category)
    if (job) params.set('jobs', job)
    if (skill) params.set('skill', skill)
    if (minLevel) params.set('minLevel', minLevel)
    if (maxLevel) params.set('maxLevel', maxLevel)
    params.set('page', page.toString())
    params.set('pageSize', '25')

    fetch(`/api/items?${params}`)
      .then((r) => r.json())
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false))
  }, [query, category, job, skill, minLevel, maxLevel, page])

  const totalPages = result ? Math.ceil(result.totalCount / result.pageSize) : 1

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <img src="/vanalytics-square-logo.png" alt="" className="h-10 w-10 shrink-0 -mr-1" />
        <img src="/vanalytics-typography-horizontal-logo.png" alt="Vana'lytics" className="h-6" />
      </div>

      <h1 className="text-2xl font-bold mb-2">Item Database</h1>
      <p className="text-sm text-gray-500 mb-6">
        Browse {result?.totalCount?.toLocaleString() ?? '...'} items from Vana'diel
      </p>

      <div className="space-y-4 mb-6">
        <ItemSearchBar value={query} onChange={setQuery} />
        <ItemFilters
          categories={categories}
          selectedCategory={category}
          onCategoryChange={(c) => { setCategory(c); if (c !== 'Weapon') setSkill('') }}
          selectedJob={job}
          onJobChange={setJob}
          minLevel={minLevel}
          maxLevel={maxLevel}
          onMinLevelChange={setMinLevel}
          onMaxLevelChange={setMaxLevel}
          selectedSkill={skill}
          onSkillChange={setSkill}
        />
      </div>

      {loading ? (
        <p className="text-gray-400">Loading items...</p>
      ) : result && result.items.length > 0 ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

---

### Task 7: Item Detail Page

**Files:**
- Create: `src/Vanalytics.Web/src/pages/ItemDetailPage.tsx`

- [ ] **Step 1: Create ItemDetailPage**

```tsx
// src/Vanalytics.Web/src/pages/ItemDetailPage.tsx
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { GameItemDetail, PriceHistoryResponse, CrossServerResponse, GameServer } from '../types/api'
import ItemStatsTable from '../components/economy/ItemStatsTable'
import PriceHistoryChart from '../components/economy/PriceHistoryChart'
import CrossServerChart from '../components/economy/CrossServerChart'
import SalesTable from '../components/economy/SalesTable'

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [item, setItem] = useState<GameItemDetail | null>(null)
  const [prices, setPrices] = useState<PriceHistoryResponse | null>(null)
  const [crossServer, setCrossServer] = useState<CrossServerResponse | null>(null)
  const [servers, setServers] = useState<GameServer[]>([])
  const [selectedServer, setSelectedServer] = useState('')
  const [days, setDays] = useState(30)
  const [salesPage, setSalesPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Load item detail
  useEffect(() => {
    fetch(`/api/items/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setItem)
      .catch(() => setItem(null))
      .finally(() => setLoading(false))

    fetch('/api/servers')
      .then((r) => r.ok ? r.json() : [])
      .then((s: GameServer[]) => {
        setServers(s)
        if (s.length > 0 && !selectedServer) setSelectedServer(s[0].name)
      })
      .catch(() => {})
  }, [id])

  // Load prices when server/days/page changes
  useEffect(() => {
    if (!selectedServer) return
    const params = new URLSearchParams({
      server: selectedServer,
      days: days.toString(),
      page: salesPage.toString(),
      pageSize: '10',
    })
    fetch(`/api/items/${id}/prices?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setPrices)
      .catch(() => setPrices(null))
  }, [id, selectedServer, days, salesPage])

  // Load cross-server comparison
  useEffect(() => {
    fetch(`/api/items/${id}/prices/all?days=${days}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setCrossServer)
      .catch(() => setCrossServer(null))
  }, [id, days])

  if (loading) return <p className="text-gray-400">Loading item...</p>
  if (!item) return <p className="text-red-400">Item not found.</p>

  return (
    <div>
      <Link to="/items" className="text-sm text-blue-400 hover:underline mb-4 inline-block">
        &larr; Back to Item Database
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="shrink-0 flex flex-col items-center gap-2">
          {item.iconPath ? (
            <img src={`/item-images/${item.iconPath}`} alt="" className="h-12 w-12" />
          ) : (
            <div className="h-12 w-12 rounded bg-gray-800" />
          )}
          {item.previewImagePath && (
            <img src={`/item-images/${item.previewImagePath}`} alt={item.name} className="max-w-[200px] rounded" />
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{item.name}</h1>
          {item.nameJa && <p className="text-sm text-gray-500">{item.nameJa}</p>}
          <div className="flex items-center gap-2 mt-1">
            <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">{item.category}</span>
            {item.level && <span className="text-xs text-gray-500">Lv.{item.level}</span>}
            {item.isRare && <span className="text-xs text-amber-500">Rare</span>}
            {item.isExclusive && <span className="text-xs text-red-400">Ex</span>}
            {item.isAuctionable && <span className="text-xs text-green-400">AH</span>}
            <span className="text-xs text-gray-600">Stack: {item.stackSize}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left column: Stats */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Item Stats</h2>
            <ItemStatsTable item={item} />
          </div>
        </div>

        {/* Right column: Prices */}
        <div className="lg:col-span-2 space-y-6">
          {/* Controls */}
          <div className="flex items-center gap-3">
            <select
              value={selectedServer}
              onChange={(e) => { setSelectedServer(e.target.value); setSalesPage(1) }}
              className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
            >
              {servers.map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
            <div className="flex gap-1">
              {[7, 30, 90, 365].map((d) => (
                <button
                  key={d}
                  onClick={() => { setDays(d); setSalesPage(1) }}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    days === d ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {/* Price summary */}
          {prices?.stats && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Median', value: prices.stats.median },
                { label: 'Min', value: prices.stats.min },
                { label: 'Max', value: prices.stats.max },
                { label: 'Average', value: prices.stats.average },
                { label: 'Sales/Day', value: prices.stats.salesPerDay, noGil: true },
              ].map((s) => (
                <div key={s.label} className="rounded border border-gray-800 bg-gray-900 p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                  <p className="text-lg font-semibold text-gray-200">
                    {typeof s.value === 'number' ? s.value.toLocaleString() : '—'}
                    {!s.noGil && <span className="text-xs text-gray-500 ml-1">gil</span>}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Price history chart */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Price History — {selectedServer}</h2>
            <PriceHistoryChart sales={prices?.sales ?? []} />
          </div>

          {/* Cross-server chart */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Cross-Server Comparison</h2>
            <CrossServerChart servers={crossServer?.servers ?? []} />
          </div>

          {/* Recent sales */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Recent Sales — {selectedServer}</h2>
            <SalesTable
              sales={prices?.sales ?? []}
              totalCount={prices?.totalCount ?? 0}
              page={salesPage}
              pageSize={10}
              onPageChange={setSalesPage}
            />
          </div>

          {/* Bazaar placeholder */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Bazaar Listings</h2>
            <p className="text-sm text-gray-500">Coming soon — bazaar tracking will be available in a future update.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

---

### Task 8: Wire Up Routes and Layout

**Files:**
- Modify: `src/Vanalytics.Web/src/App.tsx`
- Modify: `src/Vanalytics.Web/src/components/Layout.tsx`

- [ ] **Step 1: Add routes to App.tsx**

Read existing App.tsx, then add imports and routes. The economy pages are public (no ProtectedRoute):

Add imports:
```tsx
import ItemDatabasePage from './pages/ItemDatabasePage'
import ItemDetailPage from './pages/ItemDetailPage'
import BazaarActivityPage from './pages/BazaarActivityPage'
```

Add routes inside the `<Route element={<Layout />}>` block, before the `/:server/:name` catch-all route:
```tsx
            <Route path="/items" element={<ItemDatabasePage />} />
            <Route path="/items/:id" element={<ItemDetailPage />} />
            <Route path="/bazaar" element={<BazaarActivityPage />} />
```

Create the placeholder page at `src/Vanalytics.Web/src/pages/BazaarActivityPage.tsx`:
```tsx
import { Link } from 'react-router-dom'

export default function BazaarActivityPage() {
  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <img src="/vanalytics-square-logo.png" alt="" className="h-10 w-10 shrink-0 -mr-1" />
        <img src="/vanalytics-typography-horizontal-logo.png" alt="Vana'lytics" className="h-6" />
      </div>

      <h1 className="text-2xl font-bold mb-2">Bazaar Activity</h1>
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
        <p className="text-gray-400 mb-2">Bazaar tracking is coming soon.</p>
        <p className="text-sm text-gray-500 mb-4">
          Live bazaar presence detection and item browsing will be available in a future update.
        </p>
        <Link to="/items" className="text-sm text-blue-400 hover:underline">
          Browse the Item Database
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update Layout to handle /items routes as public pages**

Read existing `Layout.tsx`. The `isPublicPage` check needs to include `/items` routes. Update the condition:

Change:
```tsx
  const isPublicPage =
    location.pathname === '/' ||
    location.pathname === '/login' ||
    (!user && !location.pathname.startsWith('/dashboard'))
```

To:
```tsx
  const isPublicPage =
    location.pathname === '/' ||
    location.pathname === '/login' ||
    location.pathname.startsWith('/items') ||
    location.pathname.startsWith('/bazaar') ||
    (!user && !location.pathname.startsWith('/dashboard'))
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

---

### Task 9: Verify and Smoke Test

- [ ] **Step 1: Run the dev server and verify pages load**

```bash
cd src/Vanalytics.Web && npm run dev
```

With the backend running (via Docker Compose), navigate to:
- `http://localhost:3000/items` — should show item search with results
- `http://localhost:3000/items/4096` — should show Fire Crystal detail page
- Search for "Vajra" — should filter results
- Category filter — should work

- [ ] **Step 2: Verify production build**

```bash
npm run build
```

Expected: Build succeeds with no errors.
