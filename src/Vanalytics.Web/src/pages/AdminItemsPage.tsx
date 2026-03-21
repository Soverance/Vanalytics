import { useState, useEffect } from 'react'
import { api } from '../api/client'

interface ItemDbStats {
  items: {
    total: number
    withIcons: number
    withPreviews: number
    withDescriptions: number
    missingIcons: number
    missingPreviews: number
    iconCoverage: number
    categories: { category: string; count: number }[]
  }
  economy: {
    totalAhSales: number
    totalBazaarListings: number
    activeBazaarListings: number
    activeBazaarPresences: number
  }
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-200">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-gray-600 mt-1">{sub}</p>}
    </div>
  )
}

export default function AdminItemsPage() {
  const [stats, setStats] = useState<ItemDbStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api<ItemDbStats>('/api/admin/items/stats')
      .then(setStats)
      .catch(() => setError('Failed to load item database stats'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-gray-400">Loading item database stats...</p>
  if (error) return <p className="text-red-400">{error}</p>
  if (!stats) return null

  const { items, economy } = stats

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Item Database Health</h1>

      {/* Item stats */}
      <h2 className="text-lg font-semibold mb-3">Items</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Items" value={items.total} />
        <StatCard label="Icon Coverage" value={`${items.iconCoverage}%`} sub={`${items.withIcons} of ${items.total}`} />
        <StatCard label="Missing Icons" value={items.missingIcons} />
        <StatCard label="With Descriptions" value={items.withDescriptions} />
      </div>

      {/* Economy stats */}
      <h2 className="text-lg font-semibold mb-3">Economy Data</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="AH Transactions" value={economy.totalAhSales} />
        <StatCard label="Bazaar Listings (Total)" value={economy.totalBazaarListings} />
        <StatCard label="Bazaar Listings (Active)" value={economy.activeBazaarListings} />
        <StatCard label="Bazaar Presences (Active)" value={economy.activeBazaarPresences} />
      </div>

      {/* Categories breakdown */}
      <h2 className="text-lg font-semibold mb-3">Categories</h2>
      <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800/50 text-left text-gray-500">
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium text-right">Items</th>
              <th className="px-4 py-2.5 font-medium">Distribution</th>
            </tr>
          </thead>
          <tbody>
            {items.categories.map((c) => {
              const pct = items.total > 0 ? (c.count / items.total) * 100 : 0
              return (
                <tr key={c.category} className="border-t border-gray-800">
                  <td className="px-4 py-2 text-gray-300">{c.category}</td>
                  <td className="px-4 py-2 text-gray-400 text-right">{c.count.toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-gray-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-600"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-10 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
