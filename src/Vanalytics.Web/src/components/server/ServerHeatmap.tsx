import type { ServerHeatmapData } from '../../types/api'

interface Props {
  data: ServerHeatmapData[]
  days: number
  onServerClick: (serverName: string) => void
}

function cellColor(uptimePercent: number): string {
  if (uptimePercent < 0) return 'bg-gray-800'
  if (uptimePercent > 99) return 'bg-green-500'
  if (uptimePercent > 95) return 'bg-amber-500'
  return 'bg-red-500'
}

export default function ServerHeatmap({ data, days, onServerClick }: Props) {
  if (data.length === 0) return <p className="text-gray-500 text-sm">No data</p>

  const maxCols = days <= 7 ? data[0]?.days.length : days <= 30 ? 30 : days <= 90 ? 90 : 52

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[400px]">
        {data.map(server => (
          <div key={server.name} className="flex items-center gap-2 mb-1">
            <button
              onClick={() => onServerClick(server.name)}
              className="w-20 text-xs text-gray-400 text-right truncate hover:text-blue-400 hover:underline shrink-0"
              title={server.name}
            >
              {server.name}
            </button>
            <div className="flex gap-px flex-1">
              {server.days.slice(-maxCols).map((cell, i) => (
                <div
                  key={i}
                  className={`h-3 flex-1 rounded-sm ${cellColor(cell.uptimePercent)}`}
                  title={`${cell.date}: ${cell.uptimePercent}% (${cell.dominantStatus})`}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-1">
          <div className="w-20 shrink-0" />
          <div className="flex justify-between flex-1 text-[10px] text-gray-600">
            <span>{data[0]?.days[Math.max(0, data[0].days.length - maxCols)]?.date ?? ''}</span>
            <span>{data[0]?.days[data[0].days.length - 1]?.date ?? ''}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="w-20 shrink-0" />
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-500" /> &gt;99%</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-amber-500" /> &gt;95%</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> &le;95%</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-gray-800" /> No data</span>
          </div>
        </div>
      </div>
    </div>
  )
}
