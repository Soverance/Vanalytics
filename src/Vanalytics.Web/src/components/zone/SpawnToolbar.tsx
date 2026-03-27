import { Search } from 'lucide-react'

interface SpawnToolbarProps {
  filter: string
  onFilterChange: (value: string) => void
  showSkybeams: boolean
  onToggleSkybeams: () => void
  spawnCount: number
  filteredCount: number
}

export default function SpawnToolbar({
  filter, onFilterChange, showSkybeams, onToggleSkybeams, spawnCount, filteredCount
}: SpawnToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700/50 shadow-lg">
      <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      <input
        type="text"
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
        placeholder="Search spawns..."
        className="bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none w-40"
      />
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {filter ? `${filteredCount} / ${spawnCount}` : `${spawnCount} spawns`}
      </span>
      {filter && (
        <button
          onClick={onToggleSkybeams}
          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
            showSkybeams
              ? 'bg-yellow-600/30 text-yellow-300 border border-yellow-600/50'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Beams
        </button>
      )}
    </div>
  )
}
