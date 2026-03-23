import type { ServiceHealth, ServerRanking } from '../../types/api'

interface Props {
  health: ServiceHealth
  rankings: ServerRanking[]
}

const statusColors: Record<string, string> = {
  Healthy: 'text-green-400 border-green-900/50',
  Degraded: 'text-amber-400 border-amber-900/50',
  Down: 'text-red-400 border-red-900/50',
}

export default function ServiceHealthCards({ health, rankings }: Props) {
  const best = rankings[0]
  const worst = rankings[rankings.length - 1]
  const statusClass = statusColors[health.status] ?? 'text-gray-400 border-gray-700'

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card label="Service Health" className={statusClass}>
        <p className="text-2xl font-bold">{health.status}</p>
        <p className="text-xs text-gray-500">{health.onlinePercent}% of worlds online</p>
      </Card>
      <Card label="Average Uptime">
        <p className="text-2xl font-bold text-blue-400">{health.uptimePercent}%</p>
        <p className="text-xs text-gray-500">All servers over period</p>
      </Card>
      <Card label="Best Server">
        <p className="text-2xl font-bold text-green-400">{best?.name ?? '—'}</p>
        <p className="text-xs text-gray-500">{best ? `${best.uptimePercent}% uptime` : 'No data'}</p>
      </Card>
      <Card label="Worst Server">
        <p className="text-2xl font-bold text-amber-400">{worst?.name ?? '—'}</p>
        <p className="text-xs text-gray-500">{worst ? `${worst.uptimePercent}% uptime` : 'No data'}</p>
      </Card>
    </div>
  )
}

function Card({ label, className = 'border-gray-700', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg border bg-gray-900 p-4 text-center ${className}`}>
      <p className="text-xs uppercase text-gray-500 mb-1">{label}</p>
      {children}
    </div>
  )
}
