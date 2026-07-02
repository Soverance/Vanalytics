import { useState, useEffect } from 'react'
import { api } from '../../api/client'
import type { PriceHistoryResponse } from '../../types/api'
import SalesTable from './SalesTable'
import { spanLabel } from '../../lib/economySpans'

const PAGE_SIZE = 25

interface Props {
  itemId: number
  server: string
  days: number
  stack: boolean
}

export default function ItemRecentSales({ itemId, server, days, stack }: Props) {
  const [data, setData] = useState<PriceHistoryResponse | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Reset to page 1 whenever the world, window, or single/stack selection changes.
  useEffect(() => { setPage(1) }, [server, days, stack])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const qs = new URLSearchParams({
      server,
      days: String(days),
      page: String(page),
      pageSize: String(PAGE_SIZE),
      stack: String(stack),
    })
    api<PriceHistoryResponse>(`/api/items/${itemId}/prices?${qs}`)
      .then(r => { if (!cancelled) setData(r) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [itemId, server, days, page, stack])

  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold text-gray-500 mb-2">Recent Sales ({spanLabel(days)})</h3>
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
        <p className="text-sm text-gray-500">{days > 0 ? `No sales in the last ${spanLabel(days)}.` : 'No sales recorded.'}</p>
      )}
    </div>
  )
}
