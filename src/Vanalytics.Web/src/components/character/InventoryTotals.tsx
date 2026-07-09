import { useMemo, useState, useEffect } from 'react'
import type { InventoryByBag, BagCapacities } from '../../types/api'
import { api } from '../../api/client'
import { capOf, sumCapacities } from './inventoryCapacity'

const BAG_ORDER = [
  'Inventory', 'Safe', 'Safe2', 'Storage', 'Locker',
  'Satchel', 'Sack', 'Case',
  'Wardrobe', 'Wardrobe2', 'Wardrobe3', 'Wardrobe4',
  'Wardrobe5', 'Wardrobe6', 'Wardrobe7', 'Wardrobe8',
]

const BAG_LABELS: Record<string, string> = {
  Inventory: 'Inventory',
  Safe: 'Mog Safe',
  Safe2: 'Mog Safe 2',
  Storage: 'Storage',
  Locker: 'Mog Locker',
  Satchel: 'Mog Satchel',
  Sack: 'Mog Sack',
  Case: 'Mog Case',
  Wardrobe: 'Mog Wardrobe 1',
  Wardrobe2: 'Mog Wardrobe 2',
  Wardrobe3: 'Mog Wardrobe 3',
  Wardrobe4: 'Mog Wardrobe 4',
  Wardrobe5: 'Mog Wardrobe 5',
  Wardrobe6: 'Mog Wardrobe 6',
  Wardrobe7: 'Mog Wardrobe 7',
  Wardrobe8: 'Mog Wardrobe 8',
}

const CATEGORY_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#10b981', '#6b7280']
const OTHER_COLOR = '#6b7280'

interface Props {
  characterId: string
  inventory: InventoryByBag
  dismissedAnomalyKeys: Set<string>
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: string | number
  subtitle: string
  valueClassName?: string
}

function StatCard({ label, value, subtitle, valueClassName = 'text-white' }: StatCardProps) {
  return (
    <div className="bg-[#1a1d27] border border-gray-700 rounded-lg p-3.5">
      <div className="text-xs uppercase text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${valueClassName}`}>{value}</div>
      <div className="text-xs text-gray-600 mt-0.5">{subtitle}</div>
    </div>
  )
}

// ─── Donut Chart ─────────────────────────────────────────────────────────────

interface CategoryEntry {
  name: string
  count: number
  color: string
}

interface DonutChartProps {
  categories: CategoryEntry[]
  totalSlots: number
}

function DonutChart({ categories, totalSlots }: DonutChartProps) {
  const r = 50
  const cx = 60
  const cy = 60
  const circumference = 2 * Math.PI * r

  // Build slices from cumulative offsets
  let offset = 0
  const slices = categories.map((cat) => {
    const fraction = totalSlots > 0 ? cat.count / totalSlots : 0
    const dash = fraction * circumference
    const gap = circumference - dash
    const currentOffset = offset
    offset += dash
    return { ...cat, dash, gap, dashOffset: circumference - currentOffset }
  })

  return (
    <div className="bg-[#1a1d27] border border-gray-700 rounded-lg p-3.5">
      <div className="text-xs uppercase text-gray-500 mb-3">Category Distribution</div>
      <div className="flex items-center gap-4">
        {/* SVG Donut */}
        <div className="flex-shrink-0">
          <svg
            width="120"
            height="120"
            viewBox="0 0 120 120"
            style={{ transform: 'rotate(-90deg)' }}
          >
            {/* Background track */}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="#374151"
              strokeWidth={16}
            />
            {slices.map((slice, i) => (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={slice.color}
                strokeWidth={16}
                strokeDasharray={`${slice.dash} ${slice.gap}`}
                strokeDashoffset={slice.dashOffset}
              />
            ))}
          </svg>
          {/* Center text — positioned absolutely over the SVG */}
          <div
            className="relative flex flex-col items-center justify-center"
            style={{ marginTop: -120, height: 120 }}
          >
            <span className="text-lg font-semibold text-white">{totalSlots}</span>
            <span className="text-xs text-gray-500">slots</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-1.5 min-w-0">
          {categories.map((cat, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span
                className="flex-shrink-0 w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: cat.color }}
              />
              <span className="text-gray-400 truncate">{cat.name}</span>
              <span className="ml-auto pl-2 text-gray-500 flex-shrink-0">{cat.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Bag Utilization Chart ────────────────────────────────────────────────────

interface BagEntry {
  key: string
  label: string
  used: number
  max: number
}

interface BagUtilizationChartProps {
  bags: BagEntry[]
  dismissedBags: Set<string>
}

function getBarColor(pct: number, dismissed: boolean): string {
  if (dismissed && pct >= 60) return 'linear-gradient(90deg, #3b82f6, #60a5fa)'
  if (pct >= 90) return 'linear-gradient(90deg, #ef4444, #f87171)'
  if (pct >= 60) return 'linear-gradient(90deg, #f59e0b, #fbbf24)'
  return 'linear-gradient(90deg, #22c55e, #4ade80)'
}

function getTextColor(pct: number, dismissed: boolean): string {
  if (dismissed && pct >= 60) return 'text-blue-400'
  if (pct >= 90) return 'text-red-400'
  if (pct >= 60) return 'text-amber-400'
  return 'text-green-400'
}

function BagUtilizationChart({ bags, dismissedBags }: BagUtilizationChartProps) {
  return (
    <div className="bg-[#1a1d27] border border-gray-700 rounded-lg p-3.5">
      <div className="text-xs uppercase text-gray-500 mb-3">Bag Utilization</div>
      <div className="flex flex-col gap-2">
        {bags.map((bag) => {
          const pct = (bag.used / bag.max) * 100
          const dismissed = dismissedBags.has(bag.key)
          const barColor = getBarColor(pct, dismissed)
          const textColor = getTextColor(pct, dismissed)
          return (
            <div key={bag.key} className="flex items-center gap-2">
              <span
                className="text-xs text-gray-400 text-right flex-shrink-0"
                style={{ width: 80 }}
              >
                {bag.label}
              </span>
              <div className="flex-1 h-4 bg-gray-800 rounded overflow-hidden">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${Math.min(pct, 100)}%`,
                    background: barColor,
                  }}
                />
              </div>
              <span
                className={`text-xs flex-shrink-0 text-right ${textColor}`}
                style={{ width: 40 }}
              >
                {bag.used}/{bag.max}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InventoryTotals({ characterId, inventory, dismissedAnomalyKeys }: Props) {
  const [capacities, setCapacities] = useState<BagCapacities>({})

  useEffect(() => {
    api<BagCapacities>(`/api/characters/${characterId}/inventory/capacities`)
      .then(setCapacities)
      .catch(() => setCapacities({}))
  }, [characterId])

  // Build set of bag keys whose nearCapacity anomaly has been dismissed
  const dismissedBags = useMemo(() => {
    const bags = new Set<string>()
    for (const key of dismissedAnomalyKeys) {
      if (key.startsWith('nearCapacity:')) {
        bags.add(key.slice('nearCapacity:'.length))
      }
    }
    return bags
  }, [dismissedAnomalyKeys])

  const computed = useMemo(() => {
    const allItems = Object.values(inventory).flat()

    // Stat card values
    const totalItems = allItems.reduce((sum, item) => sum + item.quantity, 0)
    const slotsUsed = allItems.length
    const activeBagKeys = Object.keys(inventory).filter((k) => inventory[k].length > 0)
    const totalSlots = sumCapacities(capacities, activeBagKeys)
    const availableSlots = totalSlots - slotsUsed
    const freePct = totalSlots > 0 ? Math.round((availableSlots / totalSlots) * 100) : 0
    const rareExCount = allItems.filter((item) => item.isRare || item.isExclusive).length

    // Category distribution (by slot count)
    const categoryMap = new Map<string, number>()
    for (const item of allItems) {
      const cat = item.category ?? 'Unknown'
      categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1)
    }

    const sortedCategories = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1])

    let categories: CategoryEntry[]
    if (sortedCategories.length <= 6) {
      categories = sortedCategories.map(([name, count], i) => ({
        name,
        count,
        color: CATEGORY_COLORS[i] ?? OTHER_COLOR,
      }))
    } else {
      const top5 = sortedCategories.slice(0, 5)
      const otherCount = sortedCategories.slice(5).reduce((sum, [, c]) => sum + c, 0)
      categories = [
        ...top5.map(([name, count], i) => ({
          name,
          count,
          color: CATEGORY_COLORS[i],
        })),
        { name: 'Other', count: otherCount, color: OTHER_COLOR },
      ]
    }

    // Bag utilization
    const bags: BagEntry[] = BAG_ORDER
      .filter((key) => (inventory[key]?.length ?? 0) > 0)
      .map((key) => ({
        key,
        label: BAG_LABELS[key] ?? key,
        used: inventory[key].length,
        max: capOf(capacities, key),
      }))

    return {
      totalItems,
      slotsUsed,
      totalSlots,
      availableSlots,
      freePct,
      rareExCount,
      categories,
      bags,
    }
  }, [inventory, capacities])

  return (
    <div className="space-y-4">
      {/* Top row: 2x2 stat cards (left) + donut chart (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Total Items"
            value={computed.totalItems.toLocaleString()}
            subtitle="across all bags"
          />
          <StatCard
            label="Slots Used"
            value={computed.slotsUsed.toLocaleString()}
            subtitle={`of ${computed.totalSlots.toLocaleString()} total`}
          />
          <StatCard
            label="Available Slots"
            value={computed.availableSlots.toLocaleString()}
            subtitle={`${computed.freePct}% free`}
            valueClassName="text-green-400"
          />
          <StatCard
            label="Rare/Ex Items"
            value={computed.rareExCount.toLocaleString()}
            subtitle="cannot be traded"
            valueClassName="text-purple-400"
          />
        </div>
        <DonutChart
          categories={computed.categories}
          totalSlots={computed.slotsUsed}
        />
      </div>

      {/* Full-width bag utilization chart */}
      <BagUtilizationChart bags={computed.bags} dismissedBags={dismissedBags} />
    </div>
  )
}
