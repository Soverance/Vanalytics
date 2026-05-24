import { useState, useEffect } from 'react'
import { api } from '../../api/client'
import type { ProgressionResponse, JobPointEntry } from '../../types/api'
import LoadingSpinner from '../LoadingSpinner'
import { WARP_CATEGORY_LABELS, WARP_CATEGORY_CAPACITY, lookupWarp, type WarpCategory } from '../../lib/warps'

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
                    {named.map(j => (
                        <tr key={j.jobId} className="border-t border-gray-700/50">
                            <td className="px-3 py-1.5 text-gray-100 font-medium">{j.name}</td>
                            <td className="px-3 py-1.5 text-right text-gray-300 tabular-nums">{j.capacityPoints.toLocaleString()}</td>
                            <td className="px-3 py-1.5 text-right text-gray-300 tabular-nums">{j.points.toLocaleString()}</td>
                            <td className="px-3 py-1.5 text-right text-gray-300 tabular-nums">{j.pointsSpent.toLocaleString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function WarpSection({ category, ids }: { category: WarpCategory; ids: number[] }) {
    const [expanded, setExpanded] = useState(false)
    const label = WARP_CATEGORY_LABELS[category]
    const capacity = WARP_CATEGORY_CAPACITY[category]

    return (
        <div className="rounded border border-gray-700/60 bg-gray-900/30">
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full px-3 py-2 flex justify-between items-center text-left hover:bg-gray-800/50 transition-colors"
            >
                <span className="text-sm font-medium text-gray-200">{label}</span>
                <span className="text-xs text-gray-500 tabular-nums">
                    {ids.length} / {capacity} {expanded ? '▾' : '▸'}
                </span>
            </button>
            {expanded && (
                ids.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-500">None unlocked.</p>
                ) : (
                    <ul className="px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-300">
                        {ids.map(id => {
                            const entry = lookupWarp(category, id)
                            return <li key={id} className="truncate" title={entry.region}>{entry.name}</li>
                        })}
                    </ul>
                )
            )}
        </div>
    )
}

interface Props {
    characterId: string
}

export default function ProgressionTab({ characterId }: Props) {
    const [data, setData] = useState<ProgressionResponse | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        setLoading(true)
        api<ProgressionResponse>(`/api/characters/${characterId}/progression`)
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false))
    }, [characterId])

    if (loading) return <LoadingSpinner />

    const hasAnyData = data && (
        data.limitPoints !== null ||
        data.meritPointsMax !== null ||
        (data.jobPoints && data.jobPoints.length > 0) ||
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
        <div className="space-y-4 pr-2">
            {/* Top row: scalar stats */}
            <div className="grid grid-cols-2 gap-3">
                <StatCard
                    label="Limit Points"
                    value={data!.limitPoints !== null ? `${data!.limitPoints.toLocaleString()} / 10,000` : '—'}
                    sublabel="Gauge to next merit point"
                />
                <StatCard
                    label="Merit Slots"
                    value={data!.meritPointsMax?.toLocaleString() ?? '—'}
                    sublabel="Cap on unspent merits held"
                />
            </div>

            {/* Job Points */}
            <section>
                <h3 className="text-sm font-medium text-gray-300 mb-2">Job Points</h3>
                {data!.jobPoints && data!.jobPoints.length > 0
                    ? <JobPointsTable entries={data!.jobPoints} unlocked={data!.jobPointsUnlocked} />
                    : <p className="text-gray-500 text-sm">No job point data captured yet.</p>
                }
            </section>

            {/* Warps */}
            <section>
                <h3 className="text-sm font-medium text-gray-300 mb-2">Travel</h3>
                {data!.warps ? (
                    <div className="space-y-1.5">
                        {WARP_CATEGORIES.map(cat => (
                            <WarpSection
                                key={cat}
                                category={cat}
                                ids={data!.warps![cat] ?? []}
                            />
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-500 text-sm">No warp data captured yet.</p>
                )}
            </section>
        </div>
    )
}
