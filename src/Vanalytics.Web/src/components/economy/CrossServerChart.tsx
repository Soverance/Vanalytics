// src/Vanalytics.Web/src/components/economy/CrossServerChart.tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { CrossServerPrice } from '../../types/api'

interface Props {
  servers: CrossServerPrice[]
}

export default function CrossServerChart({ servers }: Props) {
  if (servers.length === 0) {
    return <p className="text-sm text-gray-500">No cross-server data available.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={servers}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="server"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
          angle={-45}
          textAnchor="end"
          height={60}
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
          formatter={(value, name) => {
            const label = name === 'median' ? 'Median' : String(name)
            return [typeof value === 'number' ? value.toLocaleString() + ' gil' : value, label]
          }}
        />
        <Bar dataKey="median" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
