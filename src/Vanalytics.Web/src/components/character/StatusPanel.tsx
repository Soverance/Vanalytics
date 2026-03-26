import { useState, useMemo, useRef } from 'react'
import type { CharacterDetail, GearEntry, GameItemDetail } from '../../types/api'
import { calculateBaseStats, STAT_KEYS, getBaseStatBreakdown, getJPGiftBonuses } from '../../lib/ffxi-stats'
import type { BaseStats } from '../../lib/ffxi-stats'

interface StatusPanelProps {
  character: CharacterDetail
  gear: GearEntry[]
  itemCache: Map<number, GameItemDetail>
}

const TABS = ['Base', 'Combat', 'Skills'] as const
type Tab = typeof TABS[number]

/** Mapping from Windower merit key to BaseStats key */
const MERIT_TO_STAT: Record<string, keyof BaseStats> = {
  max_hp: 'hp', max_mp: 'mp',
  str: 'str', dex: 'dex', vit: 'vit', agi: 'agi', int: 'int', mnd: 'mnd', chr: 'chr',
}

/** Convert merit points spent → number of levels.
 *  Windower reports total points invested (cost: 1+2+3+4+5=15 for 5 levels).
 *  Each level gives +1 stat bonus (per LandSandBoat charutils.cpp). */
function meritPointsToLevels(points: number): number {
  let remaining = points
  let levels = 0
  let cost = 1
  while (remaining >= cost && levels < 5) {
    remaining -= cost
    levels++
    cost++
  }
  return levels
}

/** Combat stat keys displayed on the Combat tab */
const COMBAT_STAT_KEYS = [
  'attack',
  'def',
  'accuracy',
  'evasion',
  'rangedAccuracy',
  'rangedAttack',
  'magicAccuracy',
  'magicDamage',
  'magicEvasion',
  'enmity',
  'haste',
  'storeTP',
] as const

type CombatStatKey = typeof COMBAT_STAT_KEYS[number]

const COMBAT_STAT_LABELS: Record<CombatStatKey, string> = {
  attack: 'Attack',
  def: 'Defense',
  accuracy: 'Accuracy',
  evasion: 'Evasion',
  rangedAccuracy: 'R.Accuracy',
  rangedAttack: 'R.Attack',
  magicAccuracy: 'M.Accuracy',
  magicDamage: 'M.Damage',
  magicEvasion: 'M.Evasion',
  enmity: 'Enmity',
  haste: 'Haste',
  storeTP: 'Store TP',
}

const STAT_LABELS: Record<keyof BaseStats, string> = {
  hp: 'HP',
  mp: 'MP',
  str: 'STR',
  dex: 'DEX',
  vit: 'VIT',
  agi: 'AGI',
  int: 'INT',
  mnd: 'MND',
  chr: 'CHR',
}

export default function StatusPanel({ character, gear, itemCache }: StatusPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Base')

  const activeJob = character.jobs.find(j => j.isActive)
  const hasRaceAndJob = !!character.race && !!activeJob


  // Check whether all equipped items have been fetched
  const equippedIds = useMemo(
    () => gear.filter(g => g.itemId > 0).map(g => g.itemId),
    [gear],
  )
  const allItemsLoaded = useMemo(
    () => equippedIds.every(id => itemCache.has(id)),
    [equippedIds, itemCache],
  )

  // Base stats: race + job + merits (per LandSandBoat charutils.cpp)
  const baseStats = useMemo<BaseStats | null>(() => {
    if (!hasRaceAndJob) return null
    const stats = calculateBaseStats(
      character.race,
      character.gender,
      activeJob!.job,
      activeJob!.level,
      character.subJob,
      character.subJobLevel ?? 0,
    )

    // Merits go into base stats — each level gives +1 (LandSandBoat: merit value=1, max 5 upgrades)
    if (character.merits) {
      for (const [meritKey, statKey] of Object.entries(MERIT_TO_STAT)) {
        const points = character.merits[meritKey]
        if (points != null && points > 0) {
          stats[statKey] += meritPointsToLevels(points)
        }
      }
    }

    return stats
  }, [character.race, character.gender, activeJob, character.subJob, character.subJobLevel, character.merits, hasRaceAndJob])

  // Bonus stats: equipment only (per LandSandBoat modifier system)
  const bonusStats = useMemo<BaseStats | null>(() => {
    if (!allItemsLoaded) return null
    const bonus: BaseStats = { hp: 0, mp: 0, str: 0, dex: 0, vit: 0, agi: 0, int: 0, mnd: 0, chr: 0 }

    // Equipment stats
    for (const id of equippedIds) {
      const item = itemCache.get(id)
      if (!item) continue
      for (const key of STAT_KEYS) {
        const val = item[key]
        if (val != null) bonus[key] += val
      }
    }

    return bonus
  }, [equippedIds, itemCache, allItemsLoaded])

  // Combat stats from equipment only
  const combatStats = useMemo<Record<CombatStatKey, number> | null>(() => {
    if (!allItemsLoaded) return null
    const totals = {} as Record<CombatStatKey, number>
    for (const key of COMBAT_STAT_KEYS) totals[key] = 0

    for (const id of equippedIds) {
      const item = itemCache.get(id)
      if (!item) continue
      for (const key of COMBAT_STAT_KEYS) {
        const val = item[key]
        if (val != null) totals[key] += val
      }
    }

    // Add JP gift bonuses for the active job
    if (activeJob) {
      const jpGifts = getJPGiftBonuses(activeJob.job, activeJob.jpSpent)
      for (const key of COMBAT_STAT_KEYS) {
        if (jpGifts[key]) totals[key] += jpGifts[key]
      }
    }

    return totals
  }, [equippedIds, itemCache, allItemsLoaded, activeJob])

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-700 mb-4">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="min-h-[320px]">
      {activeTab === 'Base' && (
        <BaseTab
          baseStats={baseStats}
          bonusStats={bonusStats}
          hp={character.hp}
          maxHp={character.maxHp}
          mp={character.mp}
          maxMp={character.maxMp}
          gear={gear}
          itemCache={itemCache}
          character={character}
        />
      )}
      {activeTab === 'Combat' && (
        <CombatTab
          combatStats={combatStats}
          allItemsLoaded={allItemsLoaded}
          gear={gear}
          itemCache={itemCache}
          activeJob={activeJob}
        />
      )}
      {activeTab === 'Skills' && <SkillsTab />}
      </div>
    </div>
  )
}

const CORE_STAT_KEYS: (keyof BaseStats)[] = ['str', 'dex', 'vit', 'agi', 'int', 'mnd', 'chr']

function VitalBar({ label, current, max, color }: { label: string; current?: number; max?: number; color: string }) {
  const pct = current != null && max != null && max > 0 ? Math.min(100, (current / max) * 100) : 100
  return (
    <div className="mb-2">
      <div className="flex justify-between text-sm mb-0.5">
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-200 font-medium">
          {current != null && max != null ? `${current} / ${max}` : max != null ? `${max}` : '—'}
        </span>
      </div>
      {max != null && (
        <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

/** Reusable tooltip for stat breakdowns */
function BreakdownTooltip({
  title,
  lines,
  anchor,
}: {
  title: string
  lines: { label: string; value: number }[]
  anchor: HTMLElement
}) {
  const total = lines.reduce((sum, l) => sum + l.value, 0)
  return (
    <div
      className="absolute z-50 w-64 rounded border border-gray-700 bg-gray-900 shadow-lg p-2 text-xs pointer-events-none"
      style={{
        top: anchor.offsetTop + anchor.offsetHeight + 4,
        right: 0,
      }}
    >
      <div className="text-gray-400 font-medium mb-1">{title}</div>
      {lines.map((line, i) => (
        <div key={i} className="flex justify-between py-0.5">
          <span className="text-gray-300 truncate mr-2">{line.label}</span>
          <span className={line.value > 0 ? 'text-green-400' : line.value < 0 ? 'text-red-400' : 'text-gray-500'}>
            {line.value > 0 ? `+${line.value}` : line.value}
          </span>
        </div>
      ))}
      <div className="flex justify-between pt-1 mt-1 border-t border-gray-700 font-medium">
        <span className="text-gray-300">Total</span>
        <span className="text-gray-200">
          {total >= 0 ? `+${total}` : total}
        </span>
      </div>
    </div>
  )
}

/** Build a breakdown of bonus sources for a specific stat (equipment only) */
function buildBonusBreakdown(
  statKey: keyof BaseStats,
  gear: GearEntry[],
  itemCache: Map<number, GameItemDetail>,
): { label: string; value: number }[] {
  const lines: { label: string; value: number }[] = []

  for (const g of gear) {
    if (g.itemId <= 0) continue
    const item = itemCache.get(g.itemId)
    if (!item) continue
    const val = item[statKey]
    if (val != null && val !== 0) {
      lines.push({ label: `${g.slot}: ${item.name}`, value: val })
    }
  }

  return lines
}

/** Build a breakdown of base stat sources (race + job + merits) */
function buildBaseBreakdown(
  statKey: keyof BaseStats,
  character: CharacterDetail,
  activeJob?: { job: string; level: number },
): { label: string; value: number }[] {
  const lines = getBaseStatBreakdown(
    statKey,
    character.race,
    character.gender,
    activeJob?.job,
    activeJob?.level ?? 0,
    character.subJob,
    character.subJobLevel ?? 0,
  )

  // Merits (converted from points spent to levels, +1 per level)
  const meritKey = Object.entries(MERIT_TO_STAT).find(([, v]) => v === statKey)?.[0]
  if (meritKey && character.merits) {
    const points = character.merits[meritKey]
    if (points != null && points > 0) {
      const levels = meritPointsToLevels(points)
      if (levels > 0) lines.push({ label: `Merits (${levels})`, value: levels })
    }
  }

  return lines
}

function BaseTab({
  baseStats,
  bonusStats,
  hp,
  maxHp,
  mp,
  maxMp,
  gear,
  itemCache,
  character,
}: {
  baseStats: BaseStats | null
  bonusStats: BaseStats | null
  hp?: number
  maxHp?: number
  mp?: number
  maxMp?: number
  gear: GearEntry[]
  itemCache: Map<number, GameItemDetail>
  character: CharacterDetail
}) {
  const [hoveredCol, setHoveredCol] = useState<'base' | 'bonus' | null>(null)
  const [hoveredStat, setHoveredStat] = useState<keyof BaseStats | null>(null)
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map())

  const activeJob = character.jobs.find(j => j.isActive)

  const breakdown = hoveredStat
    ? hoveredCol === 'bonus'
      ? buildBonusBreakdown(hoveredStat, gear, itemCache)
      : buildBaseBreakdown(hoveredStat, character, activeJob)
    : []

  const hoveredCell = hoveredStat ? cellRefs.current.get(`${hoveredCol}-${hoveredStat}`) : null
  const tooltipTitle = hoveredStat
    ? `${STAT_LABELS[hoveredStat]} ${hoveredCol === 'bonus' ? 'Bonus' : 'Base'} Breakdown`
    : ''

  return (
    <div>
      {/* HP/MP vitals with bars */}
      <VitalBar label="HP" current={hp} max={maxHp} color="bg-green-500" />
      <VitalBar label="MP" current={mp} max={maxMp} color="bg-blue-500" />

      {/* Core stats table */}
      <div className="relative">
        <table className="w-full text-sm mt-2">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700">
              <th className="text-left py-1 font-medium">Stat</th>
              <th className="text-right py-1 font-medium">Base</th>
              <th className="text-right py-1 font-medium">Bonus</th>
              <th className="text-right py-1 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {CORE_STAT_KEYS.map(key => {
              const base = baseStats ? baseStats[key] : null
              const bonus = bonusStats ? bonusStats[key] : null
              const total = base != null && bonus != null ? base + bonus : null
              return (
                <tr key={key} className="border-b border-gray-800">
                  <td className="py-1 text-gray-300">{STAT_LABELS[key]}</td>
                  <td
                    ref={el => { if (el) cellRefs.current.set(`base-${key}`, el) }}
                    onMouseEnter={() => { if (base != null) { setHoveredCol('base'); setHoveredStat(key) } }}
                    onMouseLeave={() => { setHoveredCol(null); setHoveredStat(null) }}
                    className="py-1 text-right text-gray-300 cursor-default"
                  >
                    {base != null ? base : '—'}
                  </td>
                  <td
                    ref={el => { if (el) cellRefs.current.set(`bonus-${key}`, el) }}
                    onMouseEnter={() => { if (bonus != null) { setHoveredCol('bonus'); setHoveredStat(key) } }}
                    onMouseLeave={() => { setHoveredCol(null); setHoveredStat(null) }}
                    className={`py-1 text-right cursor-default ${bonus != null && bonus > 0 ? 'text-green-400' : bonus != null && bonus < 0 ? 'text-red-400' : 'text-gray-500'}`}
                  >
                    {bonus != null ? (bonus > 0 ? `+${bonus}` : bonus < 0 ? `${bonus}` : '—') : '—'}
                  </td>
                  <td className="py-1 text-right text-gray-200 font-medium">
                    {total != null ? total : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {hoveredStat && breakdown.length > 0 && hoveredCell && (
          <BreakdownTooltip title={tooltipTitle} lines={breakdown} anchor={hoveredCell} />
        )}
      </div>
    </div>
  )
}

function buildCombatBreakdown(
  statKey: CombatStatKey,
  gear: GearEntry[],
  itemCache: Map<number, GameItemDetail>,
  activeJob?: { job: string; jpSpent: number },
): { label: string; value: number }[] {
  const lines: { label: string; value: number }[] = []

  for (const g of gear) {
    if (g.itemId <= 0) continue
    const item = itemCache.get(g.itemId)
    if (!item) continue
    const val = item[statKey]
    if (val != null && val !== 0) {
      lines.push({ label: `${g.slot}: ${item.name}`, value: val })
    }
  }

  if (activeJob) {
    const jpGifts = getJPGiftBonuses(activeJob.job, activeJob.jpSpent)
    if (jpGifts[statKey]) {
      lines.push({ label: `JP Gifts (${activeJob.job})`, value: jpGifts[statKey] })
    }
  }

  return lines
}

function CombatTab({
  combatStats,
  allItemsLoaded,
  gear,
  itemCache,
  activeJob,
}: {
  combatStats: Record<CombatStatKey, number> | null
  allItemsLoaded: boolean
  gear: GearEntry[]
  itemCache: Map<number, GameItemDetail>
  activeJob?: { job: string; level: number; jpSpent: number }
}) {
  const [hoveredStat, setHoveredStat] = useState<CombatStatKey | null>(null)
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map())

  if (!allItemsLoaded) {
    return <p className="text-gray-400 text-sm">Loading...</p>
  }

  const breakdown = hoveredStat
    ? buildCombatBreakdown(hoveredStat, gear, itemCache, activeJob)
    : []
  const hoveredCell = hoveredStat ? cellRefs.current.get(hoveredStat) : null

  return (
    <div className="relative">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 border-b border-gray-700">
            <th className="text-left py-1 font-medium">Stat</th>
            <th className="text-right py-1 font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {COMBAT_STAT_KEYS.map(key => (
            <tr key={key} className="border-b border-gray-800">
              <td className="py-1 text-gray-300">{COMBAT_STAT_LABELS[key]}</td>
              <td
                ref={el => { if (el) cellRefs.current.set(key, el) }}
                onMouseEnter={() => combatStats && combatStats[key] !== 0 ? setHoveredStat(key) : undefined}
                onMouseLeave={() => setHoveredStat(null)}
                className="py-1 text-right text-gray-200 font-medium cursor-default"
              >
                {combatStats ? combatStats[key] : 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {hoveredStat && breakdown.length > 0 && hoveredCell && (
        <BreakdownTooltip
          title={`${COMBAT_STAT_LABELS[hoveredStat]} Breakdown`}
          lines={breakdown}
          anchor={hoveredCell}
        />
      )}
    </div>
  )
}

function SkillsTab() {
  return (
    <p className="text-gray-500 text-sm italic">
      Coming soon — requires addon update
    </p>
  )
}
