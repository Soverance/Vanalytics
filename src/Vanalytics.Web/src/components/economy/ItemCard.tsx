import { Link } from 'react-router-dom'
import type { GameItemSummary } from '../../types/api'
import { useCompare } from '../compare/CompareContext'
import { itemImageUrl } from '../../utils/imageUrl'

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
          <img src={itemImageUrl(item.iconPath)} alt="" className="h-8 w-8 shrink-0" />
        ) : (
          <div className="h-8 w-8 shrink-0 rounded bg-gray-800" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-200 truncate">{item.name}</p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{item.category}</span>
            {item.level && <span>Lv.{item.level}</span>}
            {item.itemLevel != null && <span className="text-blue-400">iLv.{item.itemLevel}</span>}
            {item.isRare && <span className="text-amber-500">Rare</span>}
            {item.isExclusive && <span className="text-red-400">Ex</span>}
          </div>
        </div>
      </Link>

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
