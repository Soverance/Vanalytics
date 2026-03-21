import type { CraftingEntry } from '../types/api'

export default function CraftingTable({ skills }: { skills: CraftingEntry[] }) {
  if (skills.length === 0) return <p className="text-gray-500 text-sm">No crafting data.</p>

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-700 text-left text-gray-500">
          <th className="pb-2 font-medium">Craft</th>
          <th className="pb-2 font-medium">Level</th>
          <th className="pb-2 font-medium">Rank</th>
        </tr>
      </thead>
      <tbody>
        {skills.map((s) => (
          <tr key={s.craft} className="border-b border-gray-800">
            <td className="py-1.5">{s.craft}</td>
            <td className="py-1.5 text-gray-300">{s.level}</td>
            <td className="py-1.5 text-gray-400">{s.rank}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
