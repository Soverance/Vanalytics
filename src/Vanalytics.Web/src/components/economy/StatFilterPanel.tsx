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
