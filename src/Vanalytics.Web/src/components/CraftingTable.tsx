import type { CraftingEntry } from '../types/api'

const CRAFT_ORDER = [
  'Fishing', 'Woodworking', 'Smithing', 'Goldsmithing',
  'Clothcraft', 'Leathercraft', 'Bonecraft', 'Alchemy', 'Cooking',
  'Synergy',
]

export default function CraftingTable({ skills }: { skills: CraftingEntry[] }) {
  if (skills.length === 0) return <p className="text-gray-500 text-sm">No crafting data.</p>

  const skillMap = new Map(skills.map(s => [s.craft, s]))

  const ordered = CRAFT_ORDER
    .map(name => skillMap.get(name))
    .filter((s): s is CraftingEntry => s != null)

  return (
    <table className="text-sm max-w-md">
      <thead>
        <tr className="border-b border-gray-700 text-left text-gray-500">
          <th className="pb-2 font-medium pr-8">Craft</th>
          <th className="pb-2 font-medium pr-8">Rank</th>
          <th className="pb-2 font-medium text-right">Level</th>
        </tr>
      </thead>
      <tbody>
        {ordered.map(s => (
          <tr key={s.craft} className="border-b border-gray-800/50">
            <td className="py-1 pr-8">{s.craft}</td>
            <td className="py-1 pr-8 text-gray-400">{s.rank}</td>
            <td className="py-1 text-right text-gray-300">{s.level}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
