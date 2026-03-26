import type { CraftingEntry } from '../types/api'

const CRAFT_ORDER = [
  'Fishing', 'Woodworking', 'Smithing', 'Goldsmithing',
  'Clothcraft', 'Leathercraft', 'Bonecraft', 'Alchemy', 'Cooking',
  'Synergy',
]

// Gold threshold: the max achievable level for each craft
const GOLD_THRESHOLD: Record<string, number> = {
  Fishing: 100,
  Synergy: 80,
}
const DEFAULT_GOLD = 110 // standard crafts
const BLUE_THRESHOLD = 70 // Craftsman rank (beyond base cap for most players)

function getCraftStyle(craft: string, level: number): string {
  const gold = GOLD_THRESHOLD[craft] ?? DEFAULT_GOLD
  if (level >= gold) return 'text-amber-400 font-bold'
  if (level >= BLUE_THRESHOLD) return 'text-blue-300 font-bold'
  if (level > 0) return 'text-gray-300'
  return 'text-gray-600'
}

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
        {ordered.map(s => {
          const style = getCraftStyle(s.craft, s.level)
          return (
            <tr key={s.craft} className={`border-b border-gray-800/50 ${style}`}>
              <td className="py-1 pr-8">{s.craft}</td>
              <td className="py-1 pr-8">{s.rank}</td>
              <td className="py-1 text-right">{s.level}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
