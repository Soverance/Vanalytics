import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { ItemGearSetsResponse } from '../../types/api'
import LoadingSpinner from '../LoadingSpinner'

const PAGE_SIZE = 25

export default function ItemGearSets({ itemId }: { itemId: number }) {
  const [data, setData] = useState<ItemGearSetsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [itemId])

  useEffect(() => {
    setLoading(true)
    api<ItemGearSetsResponse>(`/api/items/${itemId}/gear-sets?page=${page}&pageSize=${PAGE_SIZE}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [itemId, page])

  if (loading) return <LoadingSpinner />
  if (!data || data.totalCount === 0) {
    return (
      <div>
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">In Gear Sets</h3>
        <p className="text-sm text-gray-500 py-3">No public gear sets include this item.</p>
      </div>
    )
  }

  const totalPages = Math.ceil(data.totalCount / PAGE_SIZE)

  return (
    <div>
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
        In Gear Sets <span className="text-gray-600">({data.totalCount})</span>
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <th className="px-3 py-2">Character</th>
            <th className="px-3 py-2">Set</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">Job</th>
          </tr>
        </thead>
        <tbody>
          {data.entries.map(e => (
            <tr key={e.setId} className="border-t border-gray-800 hover:bg-gray-800/50 transition-colors">
              <td className="px-3 py-2">
                <Link to={`/${e.server}/${e.characterName}?gearset=${e.setId}`} className="font-medium text-gray-100 hover:text-blue-400 hover:underline">
                  {e.characterName}
                </Link>
                <span className="text-gray-500"> · {e.server}</span>
              </td>
              <td className="px-3 py-2 text-gray-300">{e.setName}</td>
              <td className="px-3 py-2 text-gray-400">{e.category}</td>
              <td className="px-3 py-2 text-gray-400">{e.job ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="text-blue-400 hover:underline disabled:opacity-40 disabled:no-underline">← Prev</button>
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="text-blue-400 hover:underline disabled:opacity-40 disabled:no-underline">Next →</button>
        </div>
      )}
    </div>
  )
}
