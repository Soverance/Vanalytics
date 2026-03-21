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
