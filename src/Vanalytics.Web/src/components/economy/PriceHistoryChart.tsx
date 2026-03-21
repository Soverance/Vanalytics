// src/Vanalytics.Web/src/components/economy/PriceHistoryChart.tsx
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { AhSale } from '../../types/api'

interface Props {
  sales: AhSale[]
}

export default function PriceHistoryChart({ sales }: Props) {
  if (sales.length === 0) {
    return <p className="text-sm text-gray-500">No price data available.</p>
  }

  const data = [...sales]
    .sort((a, b) => new Date(a.soldAt).getTime() - new Date(b.soldAt).getTime())
    .map((s) => ({
      date: new Date(s.soldAt).toLocaleDateString(),
      price: s.price,
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
          formatter={(value) => [typeof value === 'number' ? value.toLocaleString() + ' gil' : value, 'Price']}
        />
        <Area
          type="monotone"
          dataKey="price"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
