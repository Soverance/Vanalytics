import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { AggregateInventoryItem } from '../../types/api'
import { deriveSellAdvice, summarizeSellAdvice } from '../../lib/sellAdvice'
import { toSellInput } from '../../lib/aggregateInventory'

const gil = (n: number) => n.toLocaleString()

interface Props {
  items: AggregateInventoryItem[]
  serverScraped: boolean
}

export default function RosterSellTab({ items, serverScraped }: Props) {
  const { summary, rows } = useMemo(() => {
    const inputs = items.map(toSellInput)
    const s = summarizeSellAdvice(inputs)
    const r = items
      .map((it) => ({ it, d: deriveSellAdvice(toSellInput(it)) }))
      .sort((a, b) => b.d.bestValue - a.d.bestValue)
    return { summary: s, rows: r }
  }, [items])

  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-500">No sellable items match.</p>
  }

  return (
    <div>
      {/* Summary bar */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-gray-700 bg-[#1a1d27] px-3 py-2 text-xs">
        <span className="text-gray-300">Vendor everything: <span className="font-semibold text-gray-100">{gil(summary.vendorEverything)}</span></span>
        <span className="text-gray-300">Sell optimally: <span className="font-semibold text-green-400">{gil(summary.sellOptimally)}</span></span>
        {summary.upside > 0 && (
          <span className="text-gray-300">Upside: <span className="font-semibold text-yellow-400">+{gil(summary.upside)}</span></span>
        )}
      </div>

      {!serverScraped && (
        <p className="mb-3 text-[11px] text-amber-400/80">
          AH data isn't available for this world — showing vendor values only.
        </p>
      )}

      <div>
        {rows.map(({ it, d }) => (
          <div key={it.itemId} className="flex items-center gap-2 border-b border-gray-800 py-2 text-sm">
            {it.iconPath && (
              <img src={`/item-images/${it.iconPath}`} alt="" className="h-7 w-auto object-contain" loading="lazy" />
            )}
            <Link to={`/items/${it.itemId}`} className="text-gray-100 hover:text-blue-400 hover:underline">
              {it.name}
            </Link>
            <span className="text-gray-500">×{it.totalQuantity.toLocaleString()}</span>
            <span className="ml-auto flex items-center gap-2">
              {d.best && (
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${d.best === 'AH' ? 'bg-green-900/50 text-green-300' : 'bg-gray-700 text-gray-300'}`}>
                  {d.best}
                </span>
              )}
              {d.ahThin && d.best === 'AH' && (
                <span className="text-[10px] text-amber-400/80" title="Few recent sales — low confidence">thin</span>
              )}
              <span className="font-semibold text-gray-100">{gil(d.bestValue)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
