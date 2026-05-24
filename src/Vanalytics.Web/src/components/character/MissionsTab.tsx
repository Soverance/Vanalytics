import { useState, useEffect } from 'react'
import { api } from '../../api/client'
import type { MissionsResponse, MissionLineState } from '../../types/api'
import LoadingSpinner from '../LoadingSpinner'
import {
    MISSION_LINE_LABELS,
    MISSION_CATALOGS,
    BITFIELD_LINES,
    POINTER_LINES,
    lookupCurrentMission,
    currentMissionPosition,
    type BitfieldLineKey,
    type PointerLineKey,
    type MissionLineKey,
} from '../../lib/missions'

function BitfieldLineSection({ line, state }: { line: BitfieldLineKey; state: MissionLineState | null }) {
    const [expanded, setExpanded] = useState(false)
    const catalog = MISSION_CATALOGS[line]
    const label = MISSION_LINE_LABELS[line]

    const completedSet = new Set(state?.completed ?? [])
    const total = catalog.length
    const done = catalog.filter(m => completedSet.has(m.id)).length
    const captured = state?.completed != null
    const complete = captured && done === total && total > 0

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
                            title="All known missions in this line completed"
                        >
                            COMPLETE
                        </span>
                    )}
                </span>
                <span className={`text-xs tabular-nums ${complete ? 'text-emerald-300' : captured ? 'text-gray-400' : 'text-gray-600'}`}>
                    {captured ? `${done} / ${total}` : '— / —'} {expanded ? '▾' : '▸'}
                </span>
            </button>
            {expanded && (
                !captured ? (
                    <p className="px-3 py-2 text-xs text-gray-500">No data captured yet — zone in-game and sync to populate.</p>
                ) : catalog.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-500">Catalog empty.</p>
                ) : (
                    <ul className="px-3 py-2 grid grid-cols-1 gap-y-1 text-xs">
                        {catalog.map(mission => {
                            const completed = completedSet.has(mission.id)
                            return (
                                <li
                                    key={mission.id}
                                    className={`flex items-baseline gap-2 ${completed ? 'text-gray-200' : 'text-gray-500'}`}
                                >
                                    <span className={`inline-block w-3 text-center ${completed ? 'text-emerald-400' : 'text-gray-700'}`}>
                                        {completed ? '✓' : '·'}
                                    </span>
                                    <span className="truncate">{mission.name}</span>
                                </li>
                            )
                        })}
                    </ul>
                )
            )}
        </div>
    )
}

function PointerLineSection({ line, state }: { line: PointerLineKey; state: MissionLineState | null }) {
    const label = MISSION_LINE_LABELS[line]
    const catalog = MISSION_CATALOGS[line]
    const total = catalog.length

    if (state?.current == null) {
        return (
            <div className="rounded border border-gray-700/60 bg-gray-900/30 px-3 py-2 flex justify-between items-center">
                <span className="text-sm font-medium text-gray-200">{label}</span>
                <span className="text-xs text-gray-600">No data captured yet</span>
            </div>
        )
    }

    const current = state.current
    const entry = lookupCurrentMission(line, current)
    const position = currentMissionPosition(line, current)
    const pct = total > 0 ? Math.min(100, (position / total) * 100) : 0
    // Strip leading underscores (used in catalog for hierarchy indication).
    const cleanName = entry?.name.replace(/^_+/, '').trim() ?? `Mission #${current}`

    return (
        <div className="rounded border border-gray-700/60 bg-gray-900/30 px-3 py-2">
            <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-sm font-medium text-gray-200">{label}</span>
                <span className="text-xs text-gray-400 tabular-nums">
                    {position} / {total}
                </span>
            </div>
            <div className="text-xs text-gray-300 truncate mb-1.5" title={cleanName}>
                {cleanName}
            </div>
            <div className="h-1 rounded-full bg-gray-700 overflow-hidden">
                <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    )
}

interface Props {
    characterId: string
}

export default function MissionsTab({ characterId }: Props) {
    const [data, setData] = useState<MissionsResponse | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        setLoading(true)
        api<MissionsResponse>(`/api/characters/${characterId}/missions`)
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false))
    }, [characterId])

    if (loading) return <LoadingSpinner />

    const allLines: MissionLineKey[] = [...BITFIELD_LINES, ...POINTER_LINES]
    const anyCaptured = data && allLines.some(line => data[line] != null)

    if (!anyCaptured) {
        return (
            <p className="text-gray-400 text-sm">
                No mission data captured yet. Mission state arrives on packet 0x056 — zone in-game
                (teleport / recall / walk to a new zone) then run a sync. Older mission lines
                (Nation / Zilart / ToAU / WotG / Assault) show full completion grids; newer lines
                (CoP / SoA / RoV / etc.) show only your current mission.
            </p>
        )
    }

    return (
        <div className="space-y-4 pr-2">
            <section>
                <h3 className="text-sm font-medium text-gray-300 mb-2">Story Lines (Completion Grids)</h3>
                <div className="space-y-1.5">
                    {BITFIELD_LINES.map(line => (
                        <BitfieldLineSection key={line} line={line} state={data![line]} />
                    ))}
                </div>
            </section>

            <section>
                <h3 className="text-sm font-medium text-gray-300 mb-2">Expansion Storylines (Current Mission)</h3>
                <div className="space-y-1.5">
                    {POINTER_LINES.map(line => (
                        <PointerLineSection key={line} line={line} state={data![line]} />
                    ))}
                </div>
            </section>
        </div>
    )
}
