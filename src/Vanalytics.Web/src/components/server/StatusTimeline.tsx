import type { ServerStatusEntry } from '../../types/api'

interface Props {
  history: ServerStatusEntry[]
  days: number
}

const statusColors: Record<string, string> = {
  Online: 'bg-green-500',
  Offline: 'bg-red-500',
  Maintenance: 'bg-amber-500',
  Unknown: 'bg-gray-500',
}

export default function StatusTimeline({ history, days }: Props) {
  const now = Date.now()
  const rangeStart = days === 0
    ? Math.min(...history.map(h => new Date(h.startedAt).getTime()), now)
    : now - days * 86400000
  const totalMs = now - rangeStart

  return (
    <div>
      <div className="relative h-8 rounded overflow-hidden bg-gray-800">
        {history.map((entry, i) => {
          const start = Math.max(new Date(entry.startedAt).getTime(), rangeStart)
          const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now
          const left = ((start - rangeStart) / totalMs) * 100
          const width = ((end - start) / totalMs) * 100
          if (width < 0.05) return null
          return (
            <div
              key={i}
              className={`absolute top-0 h-full ${statusColors[entry.status] ?? 'bg-gray-500'}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${entry.status}: ${new Date(entry.startedAt).toLocaleString()} — ${entry.endedAt ? new Date(entry.endedAt).toLocaleString() : 'Current'}`}
            />
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] text-gray-600 mt-1">
        <span>{new Date(rangeStart).toLocaleDateString()}</span>
        <span>Now</span>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-500" /> Online</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> Offline</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-amber-500" /> Maintenance</span>
      </div>
    </div>
  )
}
