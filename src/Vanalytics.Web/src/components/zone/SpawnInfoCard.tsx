import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import type { ZoneSpawnDto } from '../../types/api'

interface SpawnInfoCardProps {
  spawn: ZoneSpawnDto
  onClose: () => void
}

export default function SpawnInfoCard({ spawn, onClose }: SpawnInfoCardProps) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 bg-gray-900/95 backdrop-blur border border-gray-700 rounded-lg p-4 shadow-xl min-w-[280px]" onClick={e => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-100">{spawn.name}</h3>
          <span className={`text-xs ${spawn.isMonster ? 'text-red-400' : 'text-blue-400'}`}>
            {spawn.isMonster ? 'Monster' : 'NPC'}
          </span>
        </div>
        <button onClick={onClose} className="p-0.5 text-gray-500 hover:text-gray-300">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400">
        {spawn.poolId && <div>Pool ID: <span className="text-gray-300">{spawn.poolId}</span></div>}
        {(spawn.minLevel > 0 || spawn.maxLevel > 0) && (
          <div>Level: <span className="text-gray-300">{spawn.minLevel}–{spawn.maxLevel}</span></div>
        )}
        <div className="col-span-2">
          Pos: <span className="font-mono text-gray-300">{spawn.x.toFixed(1)}, {spawn.y.toFixed(1)}, {spawn.z.toFixed(1)}</span>
        </div>
      </div>

      {spawn.poolId && (
        <Link
          to={`/npcs?q=${encodeURIComponent(spawn.name)}`}
          className="mt-3 block text-xs text-blue-400 hover:underline"
        >
          View in NPC Browser &rarr;
        </Link>
      )}
    </div>
  )
}
