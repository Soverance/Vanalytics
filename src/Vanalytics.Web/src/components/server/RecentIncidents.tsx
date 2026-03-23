import type { ServerIncident } from '../../types/api'

interface Props {
  incidents: ServerIncident[]
}

const statusIcon: Record<string, { dot: string; label: string }> = {
  Offline: { dot: 'bg-red-400', label: 'Went offline' },
  Maintenance: { dot: 'bg-amber-400', label: 'Maintenance' },
  Unknown: { dot: 'bg-gray-400', label: 'Unknown' },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function RecentIncidents({ incidents }: Props) {
  if (incidents.length === 0) return <p className="text-gray-500 text-sm">No recent incidents</p>

  return (
    <div className="space-y-0">
      {incidents.map(inc => {
        const info = statusIcon[inc.status] ?? statusIcon.Unknown
        return (
          <div key={inc.id} className="flex items-start gap-2 px-2 py-1.5 text-sm border-b border-gray-800/50 last:border-0">
            <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${info.dot}`} />
            <div className="min-w-0">
              <span className="text-gray-200">{inc.serverName}</span>
              <span className="text-gray-500"> — {info.label} {timeAgo(inc.startedAt)}</span>
              {inc.duration && <span className="text-gray-600"> ({inc.duration})</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
