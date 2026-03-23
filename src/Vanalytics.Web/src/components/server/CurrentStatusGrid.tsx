import { ChevronRight } from 'lucide-react'

interface Props {
  servers: { name: string; status: string }[]
  onServerClick: (serverName: string) => void
}

const dotColor: Record<string, string> = {
  Online: 'bg-green-400',
  Offline: 'bg-red-400',
  Maintenance: 'bg-amber-400',
  Unknown: 'bg-gray-400',
}

export default function CurrentStatusGrid({ servers, onServerClick }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {servers.map(s => (
        <button
          key={s.name}
          onClick={() => onServerClick(s.name)}
          className="group flex items-center gap-2 rounded border border-gray-800 bg-gray-900/50 px-3 py-2 text-xs hover:bg-gray-800/50 hover:border-blue-900/50 transition-colors"
        >
          <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor[s.status] ?? 'bg-gray-400'}`} />
          <span className="text-gray-300 truncate group-hover:text-blue-400">{s.name}</span>
          <ChevronRight className="h-3 w-3 text-gray-700 group-hover:text-blue-400 ml-auto shrink-0" />
        </button>
      ))}
    </div>
  )
}
