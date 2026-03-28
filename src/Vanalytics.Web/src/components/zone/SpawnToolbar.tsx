import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import type { ZoneSpawnDto } from '../../types/api'

interface SpawnToolbarProps {
  filter: string
  onFilterChange: (value: string) => void
  showSkybeams: boolean
  onToggleSkybeams: () => void
  spawnCount: number
  filteredCount: number
  spawns: ZoneSpawnDto[]
  onSelectSpawn: (spawn: ZoneSpawnDto) => void
}

const MAX_SUGGESTIONS = 20

export default function SpawnToolbar({
  filter, onFilterChange, showSkybeams, onToggleSkybeams, spawnCount, filteredCount,
  spawns, onSelectSpawn,
}: SpawnToolbarProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Build deduplicated suggestions from filtered spawns
  const suggestions = filter.length > 0
    ? Array.from(
        spawns
          .filter(s => s.name.toLowerCase().includes(filter.toLowerCase()))
          .reduce((map, s) => {
            if (!map.has(s.name)) map.set(s.name, s)
            return map
          }, new Map<string, ZoneSpawnDto>())
          .values()
      ).slice(0, MAX_SUGGESTIONS)
    : []

  return (
    <div ref={containerRef} className="relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700/50 shadow-lg">
      <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={filter}
        onChange={(e) => { onFilterChange(e.target.value); setOpen(true) }}
        onFocus={() => { if (filter.length > 0) setOpen(true) }}
        placeholder="Search spawns..."
        className="bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none w-40"
      />
      {filter && (
        <button
          onClick={() => { onFilterChange(''); setOpen(false) }}
          className="text-gray-500 hover:text-gray-300"
        >
          <X className="w-3 h-3" />
        </button>
      )}
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {filter ? `${filteredCount} / ${spawnCount}` : `${spawnCount} spawns`}
      </span>
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

      {/* Suggestions dropdown */}
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-72 max-h-64 overflow-y-auto rounded-lg bg-gray-900/95 backdrop-blur border border-gray-700/50 shadow-xl z-50">
          {suggestions.map((spawn) => (
            <button
              key={`${spawn.name}-${spawn.x}-${spawn.z}`}
              onClick={() => {
                onSelectSpawn(spawn)
                setOpen(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-800/80 transition-colors"
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: spawn.isMonster === true ? '#ff4444' : spawn.isMonster === false ? '#4488ff' : '#44cc88',
                }}
              />
              <span className="text-gray-200 truncate">{spawn.name}</span>
              {(spawn.minLevel > 0 || spawn.maxLevel > 0) && (
                <span className="text-xs text-gray-500 ml-auto flex-shrink-0">
                  Lv.{spawn.minLevel}–{spawn.maxLevel}
                </span>
              )}
            </button>
          ))}
          {filteredCount > MAX_SUGGESTIONS && (
            <div className="px-3 py-1.5 text-xs text-gray-600">
              +{filteredCount - MAX_SUGGESTIONS} more results...
            </div>
          )}
        </div>
      )}
    </div>
  )
}
