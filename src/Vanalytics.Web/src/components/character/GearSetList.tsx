import { useState, useEffect } from 'react'
import { Download, Trash2, Check, X, Link2 } from 'lucide-react'
import { categoryLabel, groupByCategory } from '../../lib/gearSetCategories'
import { visibleSlice, type SortKey } from './gearSetFilters'
import type { GearSetSummary } from '../../types/api'

interface Props {
  rows: GearSetSummary[]            // already filtered + sorted by the parent
  knownTags: string[]
  search: string
  onSearchChange: (v: string) => void
  sort: SortKey
  onSortChange: (v: SortKey) => void
  activeTags: string[]
  onToggleTag: (tag: string) => void
  readOnly?: boolean
  showCategoryHeaders?: boolean
  onOpen: (id: number) => void
  onExport: (id: number) => void
  onDelete: (id: number) => Promise<void>
  onCopyLink?: (id: number) => void
}

export default function GearSetList({
  rows, knownTags, search, onSearchChange, sort, onSortChange,
  activeTags, onToggleTag, readOnly = false, showCategoryHeaders = false, onOpen, onExport, onDelete, onCopyLink,
}: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null)
  const [rowError, setRowError] = useState<{ id: number; msg: string } | null>(null)
  const [expanded, setExpanded] = useState(false)

  // Re-apply the row cap whenever the visible set changes (new filter/sort/selection),
  // so "Show more" reappears instead of staying bypassed for the session.
  useEffect(() => { setExpanded(false) }, [rows])

  const { shown, hiddenCount } = visibleSlice(rows, expanded)

  const confirmDelete = async (id: number) => {
    setRowError(null)
    try { await onDelete(id) }
    catch (e) { setRowError({ id, msg: e instanceof Error ? e.message : 'Failed to delete gear set.' }) }
    finally { setConfirmingDelete(null) }
  }

  const renderRow = (s: GearSetSummary) => (
    <div key={s.id} className="rounded bg-gray-800/40 border border-gray-700/40">
      <div className="flex items-center gap-3 p-2.5">
        <button onClick={() => onOpen(s.id)} className="flex-1 text-left min-w-0">
          <span className="text-sm text-gray-200">{s.name}</span>
          {s.job && <span className="ml-2 text-[10px] text-amber-300/70 px-1.5 py-0.5 rounded bg-indigo-900/40">{s.job}</span>}
          <span className="ml-2 text-[10px] text-sky-300/70 px-1.5 py-0.5 rounded bg-sky-900/30">{categoryLabel(s.category)}</span>
          {s.tags.map(t => (
            <span key={t} className="ml-1 text-[10px] text-gray-400 px-1.5 py-0.5 rounded bg-gray-700/40">{t}</span>
          ))}
          <span className="ml-2 text-[10px] text-gray-500">{s.slotCount} slots</span>
          {s.unresolvedCount > 0 && (
            <span className="ml-2 text-[10px] text-red-300" title="Items that didn't match the catalog">
              ⚠{s.unresolvedCount} unresolved
            </span>
          )}
          {s.notOwnedCount != null && s.notOwnedCount > 0 && (
            <span className="ml-2 text-[10px] text-amber-300" title="Items you don't currently own">
              {s.notOwnedCount} not owned
            </span>
          )}
        </button>
        <button onClick={() => onExport(s.id)} className="text-gray-500 hover:text-amber-300" title="Export to GearSwap">
          <Download className="h-4 w-4" />
        </button>
        {onCopyLink && (
          <button onClick={() => onCopyLink(s.id)} className="text-gray-500 hover:text-sky-300" title="Copy share link">
            <Link2 className="h-4 w-4" />
          </button>
        )}
        {!readOnly && (confirmingDelete === s.id ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400">Delete?</span>
            <button onClick={() => confirmDelete(s.id)} className="text-rose-400 hover:text-rose-300" title="Confirm delete">
              <Check className="h-4 w-4" />
            </button>
            <button onClick={() => { setRowError(null); setConfirmingDelete(null) }} className="text-gray-500 hover:text-gray-300" title="Cancel">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button onClick={() => { setRowError(null); setConfirmingDelete(s.id) }}
            className="text-gray-500 hover:text-rose-400" title="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        ))}
      </div>
      {rowError?.id === s.id && <div className="text-[11px] text-rose-300 px-3 pb-2">{rowError.msg}</div>}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input value={search} onChange={e => onSearchChange(e.target.value)}
          placeholder="Search name or tag…"
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200" />
        <select value={sort} onChange={e => onSortChange(e.target.value as SortKey)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300">
          <option value="name">Name A–Z</option>
          <option value="updated">Recently updated</option>
          <option value="slots">Slot count</option>
        </select>
      </div>

      {knownTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {knownTags.map(tag => {
            const active = activeTags.includes(tag)
            return (
              <button key={tag} onClick={() => onToggleTag(tag)}
                className={`text-[10px] px-1.5 py-0.5 rounded border ${active
                  ? 'bg-amber-900/40 text-amber-200 border-amber-700/50'
                  : 'bg-gray-800/60 text-gray-400 border-gray-700/40 hover:text-gray-200'}`}>
                {tag}
              </button>
            )
          })}
        </div>
      )}

      {rows.length === 0 && <div className="text-xs text-gray-500 py-6 text-center">No sets match.</div>}

      <div className="space-y-1.5">
        {showCategoryHeaders
          ? groupByCategory(shown).map(g => (
              <div key={g.category} className="space-y-1.5">
                <div className="px-1 pt-2 text-[10px] uppercase tracking-wide text-gray-500">{g.label}</div>
                {g.rows.map(renderRow)}
              </div>
            ))
          : shown.map(renderRow)}
      </div>

      {hiddenCount > 0 && (
        <button onClick={() => setExpanded(true)}
          className="w-full text-xs text-amber-300/80 hover:text-amber-200 py-2">
          Show {hiddenCount} more…
        </button>
      )}
    </div>
  )
}
