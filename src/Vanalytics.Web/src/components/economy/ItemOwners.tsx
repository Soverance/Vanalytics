import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { ItemOwnersResponse, ItemOwnerEntry } from '../../types/api'
import LoadingSpinner from '../LoadingSpinner'
import ItemGearSets from './ItemGearSets'

const PAGE_SIZE = 25
type SortKey = 'name' | 'server' | 'level'
type SortDir = 'asc' | 'desc'

function OwnersSection({ itemId }: { itemId: number }) {
  const [data, setData] = useState<ItemOwnersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [server, setServer] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Reset to page 1 when filters/sort/item change.
  useEffect(() => { setPage(1) }, [itemId, q, server, sortBy, sortDir])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page), pageSize: String(PAGE_SIZE), sortBy, sortDir,
    })
    if (q) params.set('q', q)
    if (server) params.set('server', server)
    api<ItemOwnersResponse>(`/api/items/${itemId}/owners?${params}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [itemId, page, q, server, sortBy, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(key); setSortDir('asc') }
  }
  const arrow = (key: SortKey) => (sortBy === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  // Server options derived from the current page (best-effort; no dedicated endpoint).
  const servers = Array.from(new Set((data?.owners ?? []).map(o => o.server))).sort()

  const totalPages = data ? Math.ceil(data.totalCount / PAGE_SIZE) : 1

  return (
    <div className="mt-6">
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
        Owners {data && data.totalCount > 0 && <span className="text-gray-600">({data.totalCount})</span>}
      </h3>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={q} onChange={e => setQ(e.target.value)} placeholder="Search name…"
          className="rounded bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-200 placeholder-gray-500"
        />
        <select
          value={server} onChange={e => setServer(e.target.value)}
          className="rounded bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-200"
        >
          <option value="">All servers</option>
          {servers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? <LoadingSpinner /> : !data || data.totalCount === 0 ? (
        <p className="text-sm text-gray-500 py-3">No public characters own this item.</p>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-3 py-2 cursor-pointer select-none" onClick={() => toggleSort('name')}>Name{arrow('name')}</th>
                <th className="px-3 py-2 cursor-pointer select-none" onClick={() => toggleSort('server')}>Server{arrow('server')}</th>
                <th className="px-3 py-2 cursor-pointer select-none" onClick={() => toggleSort('level')}>Job{arrow('level')}</th>
              </tr>
            </thead>
            <tbody>
              {data.owners.map((o: ItemOwnerEntry) => (
                <tr key={`${o.server}-${o.name}`} className="border-t border-gray-800 hover:bg-gray-800/50 transition-colors">
                  <td className="px-3 py-2">
                    <Link to={`/${o.server}/${o.name}`} className="font-medium text-gray-100 hover:text-blue-400 hover:underline">{o.name}</Link>
                  </td>
                  <td className="px-3 py-2 text-gray-400">{o.server}</td>
                  <td className="px-3 py-2 text-gray-400">{o.job && o.level ? `${o.job} ${o.level}` : '—'}</td>
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
        </>
      )}
    </div>
  )
}

export default function ItemOwners({ itemId, isRareEx }: { itemId: number; isRareEx: boolean }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-400 mb-3">Who's Using This?</h2>
      <ItemGearSets itemId={itemId} />
      {isRareEx && <OwnersSection itemId={itemId} />}
    </div>
  )
}
