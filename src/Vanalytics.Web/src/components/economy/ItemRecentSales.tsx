import { useState, useEffect } from 'react'
import { api } from '../../api/client'
import type { PriceHistoryResponse } from '../../types/api'
import SalesTable from './SalesTable'

const PAGE_SIZE = 25

interface Props {
  itemId: number
  server: string
  days: number
}

export default function ItemRecentSales({ itemId, server, days }: Props) {
  const [data, setData] = useState<PriceHistoryResponse | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Reset to page 1 whenever the world or window changes.
  useEffect(() => { setPage(1) }, [server, days])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const qs = new URLSearchParams({
      server,
      days: String(days),
      page: String(page),
      pageSize: String(PAGE_SIZE),
    })
    api<PriceHistoryResponse>(`/api/items/${itemId}/prices?${qs}`)
      .then(r => { if (!cancelled) setData(r) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [itemId, server, days, page])

  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold text-gray-500 mb-2">Recent Sales ({days}d)</h3>
      {loading && !data ? (
        <p className="text-sm text-gray-500">Loading sales…</p>
      ) : data && data.totalCount > 0 ? (
        <SalesTable
          sales={data.sales}
          totalCount={data.totalCount}
          page={data.page}
          pageSize={data.pageSize}
          onPageChange={setPage}
        />
      ) : (
        <p className="text-sm text-gray-500">No sales in the last {days} days.</p>
      )}
    </div>
  )
}
