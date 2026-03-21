// src/Vanalytics.Web/src/components/economy/ItemStatsTable.tsx
import type { GameItemDetail } from '../../types/api'

// FFXI job bitmask: bit 0 unused, WAR=bit 1, MNK=bit 2, etc.
// Matches Windower Resources items.lua encoding.
const JOB_NAMES: Record<number, string> = {
  1: 'WAR', 2: 'MNK', 3: 'WHM', 4: 'BLM', 5: 'RDM', 6: 'THF',
  7: 'PLD', 8: 'DRK', 9: 'BST', 10: 'BRD', 11: 'RNG', 12: 'SAM',
  13: 'NIN', 14: 'DRG', 15: 'SMN', 16: 'BLU', 17: 'COR', 18: 'PUP',
  19: 'DNC', 20: 'SCH', 21: 'GEO', 22: 'RUN',
}

function decodeJobs(bitmask: number | null): string[] {
  if (!bitmask) return []
  const jobs: string[] = []
  for (let bit = 1; bit <= 22; bit++) {
    if ((bitmask & (1 << bit)) !== 0 && JOB_NAMES[bit]) {
      jobs.push(JOB_NAMES[bit])
    }
  }
  return jobs
}

function StatRow({ label, value, suffix }: { label: string; value: number | null | undefined; suffix?: string }) {
  if (value == null) return null
  const display = value > 0 ? `+${value}` : `${value}`
  return (
    <div className="flex justify-between py-1 border-b border-gray-800 last:border-0">
      <span className="text-gray-400">{label}</span>
      <span className={value > 0 ? 'text-green-400' : value < 0 ? 'text-red-400' : 'text-gray-300'}>
        {display}{suffix}
      </span>
    </div>
  )
}

export default function ItemStatsTable({ item }: { item: GameItemDetail }) {
  const jobs = decodeJobs(item.jobs)

  return (
    <div className="space-y-4">
      {/* Base info */}
      <div className="grid grid-cols-2 gap-x-4 text-sm">
        {item.damage != null && (
          <div className="flex justify-between py-1 border-b border-gray-800">
            <span className="text-gray-400">DMG</span>
            <span className="text-gray-200">{item.damage}</span>
          </div>
        )}
        {item.delay != null && (
          <div className="flex justify-between py-1 border-b border-gray-800">
            <span className="text-gray-400">Delay</span>
            <span className="text-gray-200">{item.delay}</span>
          </div>
        )}
        {item.def != null && (
          <div className="flex justify-between py-1 border-b border-gray-800">
            <span className="text-gray-400">DEF</span>
            <span className="text-gray-200">{item.def}</span>
          </div>
        )}
      </div>

      {/* Main stats */}
      <div className="grid grid-cols-2 gap-x-4 text-sm">
        <StatRow label="HP" value={item.hp} />
        <StatRow label="MP" value={item.mp} />
        <StatRow label="STR" value={item.str} />
        <StatRow label="DEX" value={item.dex} />
        <StatRow label="VIT" value={item.vit} />
        <StatRow label="AGI" value={item.agi} />
        <StatRow label="INT" value={item.int} />
        <StatRow label="MND" value={item.mnd} />
        <StatRow label="CHR" value={item.chr} />
      </div>

      {/* Combat stats */}
      <div className="grid grid-cols-2 gap-x-4 text-sm">
        <StatRow label="Accuracy" value={item.accuracy} />
        <StatRow label="Attack" value={item.attack} />
        <StatRow label="Ranged Acc." value={item.rangedAccuracy} />
        <StatRow label="Ranged Atk." value={item.rangedAttack} />
        <StatRow label="Magic Acc." value={item.magicAccuracy} />
        <StatRow label="Magic Dmg." value={item.magicDamage} />
        <StatRow label="Magic Eva." value={item.magicEvasion} />
        <StatRow label="Evasion" value={item.evasion} />
        <StatRow label="Enmity" value={item.enmity} />
        <StatRow label="Haste" value={item.haste} suffix="%" />
        <StatRow label="Store TP" value={item.storeTP} />
        <StatRow label="TP Bonus" value={item.tpBonus} />
        <StatRow label="Phys. Taken" value={item.physicalDamageTaken} suffix="%" />
        <StatRow label="Magic Taken" value={item.magicDamageTaken} suffix="%" />
      </div>

      {/* Jobs */}
      {jobs.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Equippable by</p>
          <div className="flex flex-wrap gap-1">
            {jobs.map((j) => (
              <span key={j} className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-400">{j}</span>
            ))}
          </div>
        </div>
      )}

      {/* Description (special effects, aftermath, etc.) */}
      {item.description && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Description</p>
          <p className="text-sm text-gray-400 whitespace-pre-line">{item.description}</p>
        </div>
      )}
    </div>
  )
}
