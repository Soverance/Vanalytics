import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { GameItemDetail } from '../../types/api'
import { itemImageUrl } from '../../utils/imageUrl'
import ItemPreviewBox from './ItemPreviewBox'

interface RandomItemsResponse {
  spotlight: GameItemDetail
  supporting: GameItemDetail[]
}

export default function ExplorationView() {
  const [data, setData] = useState<RandomItemsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [hoveredItem, setHoveredItem] = useState<GameItemDetail | null>(null)
  const hoverRef = useRef<HTMLDivElement>(null)

  const fetchRandom = () => {
    setLoading(true)
    fetch('/api/items/random?count=7')
      .then((r) => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchRandom() }, [])

  if (loading) return <p className="text-gray-400">Discovering items...</p>
  if (!data?.spotlight) return null

  const { spotlight, supporting } = data

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-400">Explore Vana'diel</h2>
        <button
          onClick={fetchRandom}
          className="rounded bg-gray-800 px-3 py-1 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
        >
          Discover More
        </button>
      </div>

      {/* Spotlight — full width */}
      <Link
        to={`/items/${spotlight.itemId}`}
        className="block rounded-lg border border-gray-800 bg-gray-900 p-6 hover:border-gray-600 transition-colors mb-6"
      >
        <div className="flex items-start gap-6">
          <div className="shrink-0">
            {spotlight.iconPath ? (
              <img src={itemImageUrl(spotlight.iconPath)} alt="" className="h-12 w-12" />
            ) : (
              <div className="h-12 w-12 rounded bg-gray-800" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-gray-100">{spotlight.name}</h3>
            {spotlight.nameJa && <p className="text-xs text-gray-500">{spotlight.nameJa}</p>}
            <div className="flex items-center gap-2 mt-1">
              <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">{spotlight.category}</span>
              {spotlight.level != null && <span className="text-xs text-gray-500">Lv.{spotlight.level}</span>}
              {spotlight.itemLevel != null && <span className="text-xs text-blue-400">iLv.{spotlight.itemLevel}</span>}
              {spotlight.isRare && <span className="text-xs text-amber-500">Rare</span>}
              {spotlight.isExclusive && <span className="text-xs text-red-400">Ex</span>}
            </div>
            <p className="text-xs text-gray-500 mt-2">View Details &rarr;</p>
          </div>
          <div className="shrink-0 hidden md:block">
            <ItemPreviewBox item={spotlight} />
          </div>
        </div>
      </Link>

      {/* Supporting items — 3 columns, 2 rows */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {supporting.map((item) => (
          <div key={item.itemId} className="relative">
            <Link
              to={`/items/${item.itemId}`}
              className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 p-3 hover:border-gray-600 transition-colors"
              onMouseEnter={() => setHoveredItem(item)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <div className="shrink-0">
                {item.iconPath ? (
                  <img src={itemImageUrl(item.iconPath)} alt="" className="h-8 w-8" />
                ) : (
                  <div className="h-8 w-8 rounded bg-gray-800" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-200 truncate">{item.name}</p>
                <p className="text-xs text-gray-500">{item.category}</p>
              </div>
            </Link>
            {/* Hover preview */}
            {hoveredItem?.itemId === item.itemId && (
              <div
                ref={hoverRef}
                className="absolute z-50 left-0 top-full mt-1"
              >
                <ItemPreviewBox item={item} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
