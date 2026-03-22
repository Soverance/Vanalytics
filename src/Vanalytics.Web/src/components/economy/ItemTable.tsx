import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpDown, ArrowUp, ArrowDown, Settings2 } from 'lucide-react'
import type { GameItemSummary, StatFilter } from '../../types/api'
import { useCompare } from '../compare/CompareContext'
import { itemImageUrl } from '../../utils/imageUrl'

interface ItemTableProps {
  items: GameItemSummary[]
  statFilters: StatFilter[]
  sortBy: string
  sortDir: string
  onSort: (field: string) => void
}

interface ColumnDef {
  key: string
  label: string
  statKey?: keyof GameItemSummary
  width?: string
}

const BASE_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name' },
  { key: 'category', label: 'Category' },
  { key: 'level', label: 'Lv', statKey: 'level' },
  { key: 'itemLevel', label: 'iLv', statKey: 'itemLevel' },
]

const ALL_STAT_COLUMNS: ColumnDef[] = [
  { key: 'Damage', label: 'Dmg', statKey: 'damage' },
  { key: 'Delay', label: 'Dly', statKey: 'delay' },
  { key: 'DEF', label: 'DEF', statKey: 'def' },
  { key: 'HP', label: 'HP', statKey: 'hp' },
  { key: 'MP', label: 'MP', statKey: 'mp' },
  { key: 'STR', label: 'STR', statKey: 'str' },
  { key: 'DEX', label: 'DEX', statKey: 'dex' },
  { key: 'VIT', label: 'VIT', statKey: 'vit' },
  { key: 'AGI', label: 'AGI', statKey: 'agi' },
  { key: 'INT', label: 'INT', statKey: 'int' },
  { key: 'MND', label: 'MND', statKey: 'mnd' },
  { key: 'CHR', label: 'CHR', statKey: 'chr' },
  { key: 'Accuracy', label: 'Acc', statKey: 'accuracy' },
  { key: 'Attack', label: 'Atk', statKey: 'attack' },
  { key: 'RangedAccuracy', label: 'R.Acc', statKey: 'rangedAccuracy' },
  { key: 'RangedAttack', label: 'R.Atk', statKey: 'rangedAttack' },
  { key: 'MagicAccuracy', label: 'M.Acc', statKey: 'magicAccuracy' },
  { key: 'MagicDamage', label: 'M.Dmg', statKey: 'magicDamage' },
  { key: 'MagicEvasion', label: 'M.Eva', statKey: 'magicEvasion' },
  { key: 'Evasion', label: 'Eva', statKey: 'evasion' },
  { key: 'Enmity', label: 'Enm', statKey: 'enmity' },
  { key: 'Haste', label: 'Haste', statKey: 'haste' },
  { key: 'StoreTP', label: 'STP', statKey: 'storeTP' },
  { key: 'TPBonus', label: 'TP+', statKey: 'tpBonus' },
  { key: 'PhysicalDamageTaken', label: 'PDT', statKey: 'physicalDamageTaken' },
  { key: 'MagicDamageTaken', label: 'MDT', statKey: 'magicDamageTaken' },
]

type ColumnMode = 'auto' | 'all' | 'custom'

export default function ItemTable({ items, statFilters, sortBy, sortDir, onSort }: ItemTableProps) {
  const { addItem, removeItem, isSelected, isFull } = useCompare()
  const [columnMode, setColumnMode] = useState<ColumnMode>('auto')
  const [customColumns, setCustomColumns] = useState<Set<string>>(new Set())
  const [showColumnPicker, setShowColumnPicker] = useState(false)

  // Determine visible stat columns based on mode
  const activeFilterStats = new Set(statFilters.map(f => f.stat))
  let visibleStatColumns: ColumnDef[]
  if (columnMode === 'all') {
    visibleStatColumns = ALL_STAT_COLUMNS
  } else if (columnMode === 'custom') {
    visibleStatColumns = ALL_STAT_COLUMNS.filter(c => customColumns.has(c.key))
  } else {
    // auto: show columns for active stat filters
    visibleStatColumns = ALL_STAT_COLUMNS.filter(c => activeFilterStats.has(c.key))
  }

  const columns = [...BASE_COLUMNS, ...visibleStatColumns]

  const toggleCustomColumn = (key: string) => {
    setCustomColumns(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return <ArrowUpDown className="h-3 w-3 text-gray-600" />
    return sortDir === 'desc'
      ? <ArrowDown className="h-3 w-3 text-blue-400" />
      : <ArrowUp className="h-3 w-3 text-blue-400" />
  }

  return (
    <div>
      {/* Column controls */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex gap-1">
          {(['auto', 'all', 'custom'] as ColumnMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setColumnMode(mode)}
              className={`px-2 py-1 text-[10px] rounded font-medium transition-colors ${
                columnMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {mode === 'auto' ? 'Auto' : mode === 'all' ? 'All Stats' : 'Custom'}
            </button>
          ))}
        </div>
        {columnMode === 'custom' && (
          <button
            onClick={() => setShowColumnPicker(!showColumnPicker)}
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-300"
          >
            <Settings2 className="h-3 w-3" /> Columns
          </button>
        )}
      </div>

      {/* Column picker */}
      {showColumnPicker && columnMode === 'custom' && (
        <div className="flex flex-wrap gap-1.5 mb-3 p-2 rounded border border-gray-700 bg-gray-800/50">
          {ALL_STAT_COLUMNS.map(col => (
            <button
              key={col.key}
              onClick={() => toggleCustomColumn(col.key)}
              className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                customColumns.has(col.key)
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50'
                  : 'bg-gray-800 text-gray-500 border border-gray-700 hover:text-gray-300'
              }`}
            >
              {col.label}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-900 border-b border-gray-800">
              <th className="p-2 w-8" />
              {columns.map(col => {
                const sortField = col.key === 'level' ? 'level' : col.key === 'name' ? 'name' : col.key
                const sortable = col.key !== 'category'
                return (
                  <th
                    key={col.key}
                    onClick={sortable ? () => onSort(sortField) : undefined}
                    className={`p-2 text-left font-medium text-gray-400 whitespace-nowrap ${
                      sortable ? 'cursor-pointer hover:text-gray-200 select-none' : ''
                    } ${col.key === 'name' ? '' : 'text-center'}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortable && <SortIcon field={sortField} />}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {items.map(item => {
              const selected = isSelected(item.itemId)
              const disabled = !selected && isFull
              return (
                <tr
                  key={item.itemId}
                  className="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors"
                >
                  <td className="p-2">
                    <button
                      onClick={() => selected ? removeItem(item.itemId) : !disabled && addItem(item)}
                      disabled={disabled}
                      className={`h-4 w-4 rounded border flex items-center justify-center ${
                        selected
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : disabled
                          ? 'border-gray-700 bg-gray-800 opacity-30 cursor-not-allowed'
                          : 'border-gray-600 bg-gray-800 hover:border-blue-500'
                      }`}
                    >
                      {selected && <span className="text-[9px]">✓</span>}
                    </button>
                  </td>
                  {columns.map(col => {
                    if (col.key === 'name') {
                      return (
                        <td key={col.key} className="p-2">
                          <Link
                            to={`/items/${item.itemId}`}
                            className="flex items-center gap-2 hover:text-blue-400 transition-colors"
                          >
                            {item.iconPath ? (
                              <img src={itemImageUrl(item.iconPath)} alt="" className="h-5 w-5 shrink-0" />
                            ) : (
                              <div className="h-5 w-5 shrink-0 rounded bg-gray-800" />
                            )}
                            <span className="text-gray-200 truncate max-w-[180px]">{item.name}</span>
                            {item.isRare && <span className="text-amber-500">R</span>}
                            {item.isExclusive && <span className="text-red-400">Ex</span>}
                          </Link>
                        </td>
                      )
                    }
                    if (col.key === 'category') {
                      return <td key={col.key} className="p-2 text-center text-gray-400">{item.category}</td>
                    }
                    if (col.key === 'level') {
                      return <td key={col.key} className="p-2 text-center text-gray-300">{item.level ?? '—'}</td>
                    }
                    // Stat column
                    const val = col.statKey ? (item[col.statKey] as number | null) : null
                    return (
                      <td key={col.key} className={`p-2 text-center ${val != null ? 'text-gray-200' : 'text-gray-700'}`}>
                        {val != null ? (val > 0 ? `+${val}` : val) : '—'}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
