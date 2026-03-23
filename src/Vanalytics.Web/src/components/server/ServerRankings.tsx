import type { ServerRanking } from '../../types/api'

interface Props {
  rankings: ServerRanking[]
  days: number
  onServerClick: (serverName: string) => void
}

function uptimeColor(pct: number): string {
  if (pct > 99) return 'text-green-400'
  if (pct > 95) return 'text-amber-400'
  return 'text-red-400'
}

export default function ServerRankings({ rankings, days: _days, onServerClick }: Props) {
  return (
    <div className="space-y-0">
      {rankings.map((server, i) => (
        <button
          key={server.name}
          onClick={() => onServerClick(server.name)}
          className="flex w-full items-center justify-between px-2 py-1.5 text-sm hover:bg-gray-800/50 rounded transition-colors"
        >
          <span className="text-gray-300 hover:text-blue-400 hover:underline">{i + 1}. {server.name}</span>
          <span className={uptimeColor(server.uptimePercent)}>{server.uptimePercent}%</span>
        </button>
      ))}
    </div>
  )
}
