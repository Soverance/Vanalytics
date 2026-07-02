// src/Vanalytics.Web/src/components/economy/PriceHistoryChart.tsx
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { PricePoint } from '../../types/api'

interface Props {
  points: PricePoint[]
}

export default function PriceHistoryChart({ points }: Props) {
  if (points.length === 0) {
    return <p className="text-sm text-gray-500">No price data available.</p>
  }

  const data = [...points]
    .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime())
    .map((p) => ({
      date: new Date(p.t).toLocaleDateString(),
      median: p.median,
    }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
        />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
          labelStyle={{ color: '#9ca3af' }}
          itemStyle={{ color: '#60a5fa' }}
          formatter={(value) => [typeof value === 'number' ? value.toLocaleString() + ' gil' : value, 'Median']}
        />
        <Area
          type="monotone"
          dataKey="median"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
