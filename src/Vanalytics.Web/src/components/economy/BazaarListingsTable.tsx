import type { BazaarListingItem } from '../../types/api'

interface Props {
  listings: BazaarListingItem[]
}

export default function BazaarListingsTable({ listings }: Props) {
  if (listings.length === 0) {
    return <p className="text-sm text-gray-500">No active bazaar listings for this item.</p>
  }

  return (
    <div className="rounded border border-gray-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-800/50 text-left text-gray-500">
            <th className="px-4 py-2.5 font-medium">Seller</th>
            <th className="px-4 py-2.5 font-medium">Price</th>
            <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Qty</th>
            <th className="px-4 py-2.5 font-medium hidden md:table-cell">Zone</th>
            <th className="px-4 py-2.5 font-medium hidden md:table-cell">Last Seen</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((l, i) => (
            <tr key={i} className="border-t border-gray-800">
              <td className="px-4 py-2 text-gray-300">{l.sellerName}</td>
              <td className="px-4 py-2 text-gray-200 font-medium">{l.price.toLocaleString()} gil</td>
              <td className="px-4 py-2 text-gray-400 hidden sm:table-cell">{l.quantity}</td>
              <td className="px-4 py-2 text-gray-500 hidden md:table-cell">{l.zone}</td>
              <td className="px-4 py-2 text-gray-500 hidden md:table-cell">
                {new Date(l.lastSeenAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
