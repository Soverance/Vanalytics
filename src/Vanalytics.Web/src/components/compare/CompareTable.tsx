import type { GameItemDetail } from '../../types/api'
import { itemImageUrl } from '../../utils/imageUrl'

interface Props {
  items: GameItemDetail[]
}

const STAT_ROWS: { label: string; key: keyof GameItemDetail }[] = [
  { label: 'Category', key: 'category' },
  { label: 'Level', key: 'level' },
  { label: 'Stack Size', key: 'stackSize' },
  { label: 'Damage', key: 'damage' },
  { label: 'Delay', key: 'delay' },
  { label: 'Defense', key: 'def' },
  { label: 'HP', key: 'hp' },
  { label: 'MP', key: 'mp' },
  { label: 'STR', key: 'str' },
  { label: 'DEX', key: 'dex' },
  { label: 'VIT', key: 'vit' },
  { label: 'AGI', key: 'agi' },
  { label: 'INT', key: 'int' },
  { label: 'MND', key: 'mnd' },
  { label: 'CHR', key: 'chr' },
  { label: 'Accuracy', key: 'accuracy' },
  { label: 'Attack', key: 'attack' },
  { label: 'Evasion', key: 'evasion' },
  { label: 'Haste', key: 'haste' },
  { label: 'Enmity', key: 'enmity' },
  { label: 'Store TP', key: 'storeTP' },
  { label: 'TP Bonus', key: 'tpBonus' },
  { label: 'Ranged Acc.', key: 'rangedAccuracy' },
  { label: 'Ranged Atk.', key: 'rangedAttack' },
  { label: 'Magic Acc.', key: 'magicAccuracy' },
  { label: 'Magic Dmg.', key: 'magicDamage' },
  { label: 'Magic Eva.', key: 'magicEvasion' },
  { label: 'Phys. DMG Taken', key: 'physicalDamageTaken' },
  { label: 'Magic DMG Taken', key: 'magicDamageTaken' },
]

function fmt(val: GameItemDetail[keyof GameItemDetail]): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  return String(val)
}

export default function CompareTable({ items }: Props) {
  // Only show rows where at least one item has a non-null value
  const activeRows = STAT_ROWS.filter(row =>
    items.some(item => item[row.key] !== null && item[row.key] !== undefined)
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left border-collapse">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="py-2 pr-4 text-gray-400 font-medium w-32">Stat</th>
            {items.map(item => (
              <th key={item.itemId} className="py-2 px-3 text-gray-200 font-medium">
                <div className="flex items-center gap-2">
                  {item.iconPath ? (
                    <img src={itemImageUrl(item.iconPath)} alt="" className="h-6 w-6 shrink-0" />
                  ) : (
                    <div className="h-6 w-6 rounded bg-gray-700 shrink-0" />
                  )}
                  <div>
                    <span className="truncate max-w-[120px] block">{item.name}</span>
                    <span className="text-[10px] text-gray-500 font-normal">
                      {item.category}
                      {item.level ? ` Lv.${item.level}` : ''}
                      {item.itemLevel != null ? ` iLv.${item.itemLevel}` : ''}
                    </span>
                  </div>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activeRows.map((row, i) => (
            <tr key={row.key} className={i % 2 === 0 ? 'bg-gray-800/30' : ''}>
              <td className="py-1.5 pr-4 text-gray-400">{row.label}</td>
              {items.map(item => (
                <td key={item.itemId} className="py-1.5 px-3 text-gray-200">
                  {fmt(item[row.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
