import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../../api/client'
import type { RelicsResponse, GameItemDetail } from '../../types/api'
import LoadingSpinner from '../LoadingSpinner'
import ItemPreviewBox from '../economy/ItemPreviewBox'

const CATEGORY_COLORS: Record<string, string> = {
  Relic: 'bg-amber-500',
  Mythic: 'bg-purple-500',
  Empyrean: 'bg-sky-500',
  Aeonic: 'bg-emerald-500',
  Ergon: 'bg-rose-500',
}

const CATEGORY_ORDER = ['Relic', 'Mythic', 'Empyrean', 'Aeonic', 'Ergon']

interface Props {
  characterId: string
}

export default function RelicsTab({ characterId }: Props) {
  const [data, setData] = useState<RelicsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState<string>('')

  // Tooltip state
  const [hoveredItemId, setHoveredItemId] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null)
  const [itemDetailCache, setItemDetailCache] = useState<Map<number, GameItemDetail>>(new Map())
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    api<RelicsResponse>(`/api/characters/${characterId}/relics`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [characterId])

  const handleRowEnter = useCallback((itemId: number) => {
    setHoveredItemId(itemId)
    if (!itemDetailCache.has(itemId)) {
      api<GameItemDetail>(`/api/items/${itemId}`)
        .then(detail => {
          setItemDetailCache(prev => new Map(prev).set(itemId, detail))
        })
        .catch(() => {})
    }
  }, [itemDetailCache])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const margin = 16
    let left = e.clientX + margin
    let top = e.clientY + margin

    const el = tooltipRef.current
    if (el) {
      if (left + el.offsetWidth > window.innerWidth) {
        left = e.clientX - el.offsetWidth - margin
      }
      if (top + el.offsetHeight > window.innerHeight) {
        top = e.clientY - el.offsetHeight - margin
      }
    }

    setTooltipPos({ top, left })
  }, [])

  const handleRowLeave = useCallback(() => {
    setHoveredItemId(null)
    setTooltipPos(null)
  }, [])

  const hoveredDetail = hoveredItemId ? itemDetailCache.get(hoveredItemId) ?? null : null

  if (loading) return <LoadingSpinner />
  if (!data) return (
    <p className="text-gray-400">
      No relic data available. Ultimate weapon progress is tracked from your inventory history — keep syncing to build your timeline.
    </p>
  )

  const sortedProgress = [...data.progress].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
  )

  const filteredWeapons = categoryFilter
    ? data.weapons.filter(w => w.category === categoryFilter)
    : data.weapons

  // Sort weapons by category order, then by name
  const sortedWeapons = [...filteredWeapons].sort((a, b) => {
    const catDiff = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
    if (catDiff !== 0) return catDiff
    return a.baseName.localeCompare(b.baseName)
  })

  return (
    <div>
      {/* Compact progress row */}
      <div className="flex gap-2 mb-4">
        {sortedProgress.map(p => {
          const pct = p.total > 0 ? (p.collected / p.total) * 100 : 0
          const barColor = CATEGORY_COLORS[p.category] ?? 'bg-gray-500'
          return (
            <button
              key={p.category}
              onClick={() => setCategoryFilter(prev => prev === p.category ? '' : p.category)}
              className={`flex-1 px-2 py-1.5 rounded border text-xs transition-colors ${
                categoryFilter === p.category
                  ? 'border-blue-500 bg-gray-800'
                  : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'
              }`}
            >
              <div className="flex justify-between mb-1">
                <span className="text-gray-200 font-medium">{p.category}</span>
                <span className="text-gray-500">{p.collected}/{p.total}</span>
              </div>
              <div className="h-1 rounded-full bg-gray-700 overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor} transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </button>
          )
        })}
      </div>

      {/* Weapons table */}
      {sortedWeapons.length === 0 ? (
        <p className="text-gray-400 text-sm py-4">
          {categoryFilter
            ? `No ${categoryFilter} weapons found in this character's history.`
            : "No ultimate weapons found in this character's history."}
        </p>
      ) : (
        <div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-gray-400 text-xs uppercase">
                <th className="px-4 py-2 text-left w-12"></th>
                <th className="px-4 py-2 text-left">Weapon</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-left">Weapon Skill</th>
                <th className="px-4 py-2 text-right">Version</th>
              </tr>
            </thead>
            <tbody>
              {sortedWeapons.map(weapon =>
                weapon.versions.map((ver, i) => (
                  <tr
                    key={`${weapon.baseName}-${ver.itemId}`}
                    className="border-t border-gray-700/50 hover:bg-gray-800/50"
                    onMouseEnter={() => handleRowEnter(ver.itemId)}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleRowLeave}
                  >
                    <td className="px-4 py-1.5">
                      {ver.iconPath && (
                        <img
                          src={`/item-images/${ver.iconPath}`}
                          alt=""
                          className="w-8 h-auto object-contain"
                          loading="lazy"
                        />
                      )}
                    </td>
                    <td className="px-4 py-1.5 text-gray-100">
                      {ver.name}
                      {ver.currentlyHeld && (
                        <span className="ml-2 text-xs text-green-400" title="Currently in inventory">
                          held
                        </span>
                      )}
                    </td>
                    {i === 0 ? (
                      <>
                        <td className="px-4 py-1.5" rowSpan={weapon.versions.length}>
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium text-white ${CATEGORY_COLORS[weapon.category] ?? 'bg-gray-500'}`}>
                            {weapon.category}
                          </span>
                        </td>
                        <td className="px-4 py-1.5 text-gray-300" rowSpan={weapon.versions.length}>
                          {weapon.weaponSkill}
                        </td>
                      </>
                    ) : null}
                    <td className="px-4 py-1.5 text-right text-gray-400 text-xs">
                      {ver.itemLevel ? `iLvl ${ver.itemLevel}` : ver.level ? `Lv.${ver.level}` : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Item preview tooltip */}
      {hoveredDetail && tooltipPos && (
        <div
          ref={tooltipRef}
          className="fixed z-50 pointer-events-none"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
        >
          <ItemPreviewBox item={hoveredDetail} />
        </div>
      )}
    </div>
  )
}
