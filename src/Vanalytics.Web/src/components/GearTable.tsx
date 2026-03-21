import type { GearEntry } from '../types/api'

export default function GearTable({ gear }: { gear: GearEntry[] }) {
  if (gear.length === 0) return <p className="text-gray-500 text-sm">No gear data.</p>

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-700 text-left text-gray-500">
          <th className="pb-2 font-medium">Slot</th>
          <th className="pb-2 font-medium">Item</th>
        </tr>
      </thead>
      <tbody>
        {gear.map((g) => (
          <tr key={g.slot} className="border-b border-gray-800">
            <td className="py-1.5 text-gray-400">{g.slot}</td>
            <td className="py-1.5">{g.itemName}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
