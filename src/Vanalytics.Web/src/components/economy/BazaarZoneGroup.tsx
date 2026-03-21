import type { BazaarZoneGroup as BazaarZoneGroupType } from '../../types/api'

interface Props {
  group: BazaarZoneGroupType
}

export default function BazaarZoneGroup({ group }: Props) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">{group.zone}</h3>
        <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
          {group.playerCount} player{group.playerCount !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="space-y-1">
        {group.players.map((p) => (
          <div key={p.playerName} className="flex items-center justify-between text-sm">
            <span className="text-gray-300">{p.playerName}</span>
            <span className="text-xs text-gray-600">
              {new Date(p.lastSeenAt).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
