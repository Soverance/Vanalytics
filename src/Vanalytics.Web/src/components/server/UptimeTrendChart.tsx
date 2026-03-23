import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { TrendPoint } from '../../types/api'

interface Props {
  data: TrendPoint[]
  height?: number
}

export default function UptimeTrendChart({ data, height = 300 }: Props) {
  const formatted = data.map(p => ({
    ...p,
    time: new Date(p.timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
    }),
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formatted}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="time"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
          labelStyle={{ color: '#9ca3af' }}
          formatter={(value) => [`${value}%`, 'Uptime']}
        />
        <Area
          type="monotone"
          dataKey="percent"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
