import { useNavigate } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import type { CategoryResponse } from '../../types/api'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface Props {
  category: CategoryResponse
  isModerator: boolean
  onEdit?: (category: CategoryResponse) => void
  onDelete?: (id: number) => void
}

export default function ForumCategoryCard({ category, isModerator, onEdit, onDelete }: Props) {
  const navigate = useNavigate()

  return (
    <div
      onClick={() => navigate(`/forum/${category.slug}`)}
      className={`rounded-lg border bg-gray-900 p-4 cursor-pointer hover:bg-gray-800/50 transition-colors group ${
        category.isSystem
          ? 'border-l-4 border-l-amber-500 border-t-gray-800 border-r-gray-800 border-b-gray-800'
          : 'border-gray-800'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-100 group-hover:text-blue-400">{category.name}</h3>
          {category.isSystem && (
            <span className="text-[10px] font-medium uppercase tracking-wider text-amber-500/80 bg-amber-500/10 px-1.5 py-0.5 rounded">System</span>
          )}
        </div>
        {isModerator && !category.isSystem && (
          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
            <button onClick={() => onEdit?.(category)} className="p-1 text-gray-600 hover:text-gray-300" title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onDelete?.(category.id)} className="p-1 text-gray-600 hover:text-red-400" title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      {category.description && <p className="text-sm text-gray-500 mt-1">{category.description}</p>}
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-600">
        <span>{category.threadCount} threads</span>
        {category.lastActivityAt && <span>Last activity {timeAgo(category.lastActivityAt)}</span>}
      </div>
    </div>
  )
}
