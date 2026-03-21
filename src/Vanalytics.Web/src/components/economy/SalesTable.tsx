// src/Vanalytics.Web/src/components/economy/SalesTable.tsx
import type { AhSale } from '../../types/api'

interface Props {
  sales: AhSale[]
  totalCount: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
}

export default function SalesTable({ sales, totalCount, page, pageSize, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  if (sales.length === 0) {
    return <p className="text-sm text-gray-500">No recent sales recorded.</p>
  }

  return (
    <div>
      <div className="rounded border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800/50 text-left text-gray-500">
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Price</th>
              <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Buyer</th>
              <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Seller</th>
              <th className="px-4 py-2.5 font-medium hidden md:table-cell">Qty</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s, i) => (
              <tr key={i} className="border-t border-gray-800">
                <td className="px-4 py-2 text-gray-400">
                  {new Date(s.soldAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-2 text-gray-200 font-medium">
                  {s.price.toLocaleString()} gil
                </td>
                <td className="px-4 py-2 text-gray-400 hidden sm:table-cell">{s.buyerName}</td>
                <td className="px-4 py-2 text-gray-400 hidden sm:table-cell">{s.sellerName}</td>
                <td className="px-4 py-2 text-gray-500 hidden md:table-cell">{s.stackSize}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className="rounded px-3 py-1.5 text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">
            Page {page} of {totalPages} ({totalCount} sales)
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="rounded px-3 py-1.5 text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
