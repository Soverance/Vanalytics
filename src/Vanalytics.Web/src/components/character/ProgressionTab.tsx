import { useState, useEffect } from 'react'
import { api } from '../../api/client'
import type { ProgressionResponse, JobPointEntry, MasterLevelEntry, CurrencyResponse } from '../../types/api'
import LoadingSpinner from '../LoadingSpinner'
import Tabs from '../Tabs'
import { WARP_CATEGORY_LABELS, WARP_CATEGORY_CAPACITY, listWarps, type WarpCategory } from '../../lib/warps'
import CurrencyTable from './CurrencyTable'

const PROGRESSION_TABS = ['Job Points', 'Master Levels', 'Travel', 'Currency'] as const
type ProgressionSubTab = typeof PROGRESSION_TABS[number]

// Job IDs in packet 0x063 Order 0x05 are 0-indexed; slot 0 is NONE.
// Slots 1–22 match the standard FFXI job IDs (WAR..RUN). Slots 23 is
// reserved/unused. Names mirror ItemStatsTable's JOB_NAMES table.
const JOB_NAMES: Record<number, string> = {
    1: 'WAR', 2: 'MNK', 3: 'WHM', 4: 'BLM', 5: 'RDM', 6: 'THF',
    7: 'PLD', 8: 'DRK', 9: 'BST', 10: 'BRD', 11: 'RNG', 12: 'SAM',
    13: 'NIN', 14: 'DRG', 15: 'SMN', 16: 'BLU', 17: 'COR', 18: 'PUP',
    19: 'DNC', 20: 'SCH', 21: 'GEO', 22: 'RUN',
}

const WARP_CATEGORIES: WarpCategory[] = [
    'homePoints', 'survivalGuides', 'waypoints', 'telepoints', 'cavernousMaws', 'lycopodium', 'eschanPortals',
]

function StatCard({ label, value, sublabel }: { label: string; value: string | number; sublabel?: string }) {
    return (
        <div className="rounded-lg border border-gray-700 bg-gray-900/50 px-4 py-3">
            <div className="text-xs uppercase text-gray-500 tracking-wide">{label}</div>
            <div className="text-2xl font-semibold text-gray-100 mt-1">{value}</div>
            {sublabel && <div className="text-xs text-gray-400 mt-0.5">{sublabel}</div>}
        </div>
    )
}

// Capacity Points cap at 29,999 in-game (the next tick converts directly to
// a job point, so the gauge never actually displays 30,000 — same off-by-one
// convention as XP and Limit Points). At this value the job is "maxed".
const CAPACITY_POINTS_CAP = 29999

function JobPointsTable({ entries, unlocked }: { entries: JobPointEntry[]; unlocked: boolean | null }) {
    const named = entries
        .filter(e => JOB_NAMES[e.jobId])
        .map(e => ({ ...e, name: JOB_NAMES[e.jobId] }))
        .sort((a, b) => b.pointsSpent - a.pointsSpent || b.capacityPoints - a.capacityPoints)

    if (named.length === 0) {
        return <p className="text-gray-500 text-sm">No job point data captured yet.</p>
    }

    return (
        <div>
            {unlocked === false && (
                <p className="text-xs text-amber-400 mb-2">
                    Job Points system not yet unlocked on this character.
                </p>
            )}
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-gray-800 text-gray-400 text-xs uppercase">
                        <th className="px-3 py-2 text-left">Job</th>
                        <th className="px-3 py-2 text-right">Capacity</th>
                        <th className="px-3 py-2 text-right">JP</th>
                        <th className="px-3 py-2 text-right">Spent</th>
                    </tr>
                </thead>
                <tbody>
                    {named.map(j => {
                        const atCap = j.capacityPoints >= CAPACITY_POINTS_CAP
                        return (
                            <tr key={j.jobId} className="border-t border-gray-700/50">
                                <td className="px-3 py-1.5 text-gray-100 font-medium">{j.name}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                    <span className={atCap ? 'text-amber-300' : 'text-gray-300'}>
                                        {j.capacityPoints.toLocaleString()}
                                    </span>
                                    {atCap && (
                                        <span
                                            className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 align-middle"
                                            title="Capacity points at cap — ready to convert to a job point"
                                        >
                                            MAX
                                        </span>
                                    )}
                                </td>
                                <td className="px-3 py-1.5 text-right text-gray-300 tabular-nums">{j.points.toLocaleString()}</td>
                                <td className="px-3 py-1.5 text-right text-gray-300 tabular-nums">{j.pointsSpent.toLocaleString()}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

// Master Level caps at 50 per job.
const MASTER_LEVEL_CAP = 50

function MasterLevelsTable({ entries }: { entries: MasterLevelEntry[] }) {
    const named = entries
        .filter(e => JOB_NAMES[e.jobId])
        .map(e => ({ ...e, name: JOB_NAMES[e.jobId] }))
        .sort((a, b) => b.masterLevel - a.masterLevel || a.name.localeCompare(b.name))

    if (named.length === 0) {
        return (
            <p className="text-gray-500 text-sm">
                No master levels captured yet. Master Levels sync on your next login/zone
                once a job has the Master Breaker key item.
            </p>
        )
    }

    const totalMl = named.reduce((sum, j) => sum + j.masterLevel, 0)
    const masteredJobs = named.filter(j => j.masterLevel > 0).length

    return (
        <div>
            <div className="flex gap-4 mb-3 text-sm text-gray-400">
                <span>Total ML: <span className="text-gray-100 font-semibold tabular-nums">{totalMl}</span></span>
                <span>Mastered jobs: <span className="text-gray-100 font-semibold tabular-nums">{masteredJobs}</span></span>
            </div>
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-gray-800 text-gray-400 text-xs uppercase">
                        <th className="px-3 py-2 text-left">Job</th>
                        <th className="px-3 py-2 text-right">ML</th>
                        <th className="px-3 py-2 text-right">Exemplar Points</th>
                    </tr>
                </thead>
                <tbody>
                    {named.map(j => {
                        const capped = j.capped || j.masterLevel >= MASTER_LEVEL_CAP
                        const hasEp = j.epCurrent != null && j.epNeeded != null && j.epNeeded > 0
                        return (
                            <tr key={j.jobId} className="border-t border-gray-700/50">
                                <td className="px-3 py-1.5 text-gray-100 font-medium">{j.name}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                    <span className={capped ? 'text-amber-300' : 'text-gray-200'}>{j.masterLevel}</span>
                                    {capped && (
                                        <span
                                            className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 align-middle"
                                            title="Master Level at cap (50)"
                                        >
                                            MAX
                                        </span>
                                    )}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-gray-300">
                                    {capped ? '—' : hasEp
                                        ? `${j.epCurrent!.toLocaleString()} / ${j.epNeeded!.toLocaleString()}`
                                        : '—'}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

function WarpSection({ category, ids }: { category: WarpCategory; ids: number[] }) {
    const [expanded, setExpanded] = useState(false)
    const label = WARP_CATEGORY_LABELS[category]
    const capacity = WARP_CATEGORY_CAPACITY[category]
    const complete = capacity > 0 && ids.length >= capacity

    return (
        <div className="rounded border border-gray-700/60 bg-gray-900/30">
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full px-3 py-2 flex justify-between items-center text-left hover:bg-gray-800/50 transition-colors"
            >
                <span className="text-sm font-medium text-gray-200 flex items-center gap-2">
                    {label}
                    {complete && (
                        <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-300"
                            title="All known destinations in this category unlocked"
                        >
                            COMPLETE
                        </span>
                    )}
                </span>
                <span className={`text-xs tabular-nums ${complete ? 'text-emerald-300' : 'text-gray-500'}`}>
                    {ids.length} / {capacity} {expanded ? '▾' : '▸'}
                </span>
            </button>
            {expanded && (
                <ul className="px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {listWarps(category, ids).map(({ entry, obtained }) => (
                        <li
                            key={entry.id}
                            className="flex items-baseline gap-2 truncate"
                            title={entry.region}
                        >
                            <span className={`w-3 text-center ${obtained ? 'text-emerald-400' : 'text-gray-700'}`}>
                                {obtained ? '✓' : '·'}
                            </span>
                            <span className={`truncate ${obtained ? 'text-gray-200' : 'text-gray-500'}`}>
                                {entry.name}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

interface Props {
    characterId: string
    fetchBase?: string
}

export default function ProgressionTab({ characterId, fetchBase }: Props) {
    const base = fetchBase ?? `/api/characters/${characterId}`
    const [data, setData] = useState<ProgressionResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [subTab, setSubTab] = useState<ProgressionSubTab>('Job Points')

    useEffect(() => {
        setLoading(true)
        api<ProgressionResponse>(`${base}/progression`)
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false))
    }, [base])

    const [currencyData, setCurrencyData] = useState<CurrencyResponse | null>(null)
    // 3-state so the refetch guard ('idle' vs not) is distinct from the render
    // decision ('done' means the fetch actually completed): 'loading' shows a
    // spinner, only 'done'-with-empty shows the "run a sync" message.
    const [currencyStatus, setCurrencyStatus] = useState<'idle' | 'loading' | 'done'>('idle')

    useEffect(() => {
        // Reset currencies when the character (base) changes.
        setCurrencyData(null)
        setCurrencyStatus('idle')
    }, [base])

    useEffect(() => {
        if (subTab !== 'Currency' || currencyStatus !== 'idle') return
        setCurrencyStatus('loading')
        api<CurrencyResponse>(`${base}/currencies`)
            .then(d => { setCurrencyData(d); setCurrencyStatus('done') })
            .catch(() => { setCurrencyData(null); setCurrencyStatus('done') })
    }, [subTab, base, currencyStatus])

    if (loading) return <LoadingSpinner />

    const hasAnyData = data && (
        data.limitPoints !== null ||
        data.meritPointsMax !== null ||
        (data.jobPoints && data.jobPoints.length > 0) ||
        (data.masterLevels && data.masterLevels.length > 0) ||
        data.warps
    )

    if (!hasAnyData) {
        return (
            <p className="text-gray-400 text-sm">
                No progression data captured yet. Progression syncs when the addon sees packet 0x063 —
                visit a Home Point, open the Merit Points menu, or check the Job Points menu in-game,
                then run a sync.
            </p>
        )
    }

    return (
        <div className="pr-2">
            {/* Header strip: scalar stats stay always-visible above the sub-tabs */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <StatCard
                    label="Limit Points"
                    value={data!.limitPoints !== null ? `${data!.limitPoints.toLocaleString()} / 10,000` : '—'}
                    sublabel="Gauge to next merit point"
                />
                <StatCard
                    label="Merit Points"
                    value={
                        data!.meritPoints !== null && data!.meritPointsMax !== null
                            ? `${data!.meritPoints.toLocaleString()} / ${data!.meritPointsMax.toLocaleString()}`
                            : data!.meritPointsMax !== null
                                ? `— / ${data!.meritPointsMax.toLocaleString()}`
                                : '—'
                    }
                    sublabel="Currently held / cap"
                />
            </div>

            <Tabs items={PROGRESSION_TABS} value={subTab} onChange={setSubTab} />

            {subTab === 'Job Points' ? (
                data!.jobPoints && data!.jobPoints.length > 0
                    ? <JobPointsTable entries={data!.jobPoints} unlocked={data!.jobPointsUnlocked} />
                    : <p className="text-gray-500 text-sm">No job point data captured yet.</p>
            ) : subTab === 'Master Levels' ? (
                <MasterLevelsTable entries={data!.masterLevels ?? []} />
            ) : subTab === 'Travel' ? (
                data!.warps ? (
                    <div className="space-y-1.5">
                        {WARP_CATEGORIES.map(cat => (
                            <WarpSection key={cat} category={cat} ids={data!.warps![cat] ?? []} />
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-500 text-sm">No warp data captured yet.</p>
                )
            ) : (
                currencyData && Object.keys(currencyData.currencies).length > 0
                    ? <CurrencyTable currencies={currencyData.currencies} />
                    : currencyStatus === 'done'
                        ? <p className="text-gray-500 text-sm">No currency data captured yet. Open the Currencies I / II menus in-game, then run a sync.</p>
                        : <LoadingSpinner />
            )}
        </div>
    )
}
