import { useNavigate } from 'react-router-dom'

interface Props {
  servers: { name: string; status: string }[]
}

const dotColor: Record<string, string> = {
  Online: 'bg-green-400',
  Offline: 'bg-red-400',
  Maintenance: 'bg-amber-400',
  Unknown: 'bg-gray-400',
}

export default function CurrentStatusGrid({ servers }: Props) {
  const navigate = useNavigate()

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {servers.map(s => (
        <button
          key={s.name}
          onClick={() => navigate(`/server/status/${encodeURIComponent(s.name)}`)}
          className="flex items-center gap-2 rounded border border-gray-800 bg-gray-900/50 px-3 py-2 text-xs hover:bg-gray-800/50 transition-colors"
        >
          <span className={`h-2 w-2 rounded-full ${dotColor[s.status] ?? 'bg-gray-400'}`} />
          <span className="text-gray-300 truncate">{s.name}</span>
        </button>
      ))}
    </div>
  )
}
