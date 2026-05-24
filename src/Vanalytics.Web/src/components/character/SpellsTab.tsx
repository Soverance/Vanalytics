import { useState, useEffect, useMemo } from 'react'
import { api } from '../../api/client'
import type { CollectionResponse } from '../../types/api'
import LoadingSpinner from '../LoadingSpinner'
import { SPELLS, SPELL_TYPE_LABELS, type SpellType } from '../../lib/spells'

interface Props {
    characterId: string
}

const TYPE_ORDER: SpellType[] = [
    'WhiteMagic', 'BlackMagic', 'SummonerPact', 'Ninjutsu',
    'BardSong', 'BlueMagic', 'Geomancy', 'Trust',
]

export default function SpellsTab({ characterId }: Props) {
    const [data, setData] = useState<CollectionResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<SpellType | 'All'>('All')

    useEffect(() => {
        setLoading(true)
        api<CollectionResponse>(`/api/characters/${characterId}/collection`)
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false))
    }, [characterId])

    const knownSet = useMemo(() => new Set(data?.spellIds ?? []), [data])

    // Group spells by type; filter pills hide types with zero matches.
    const grouped = useMemo(() => {
        const byType = new Map<SpellType, typeof SPELLS>()
        for (const s of SPELLS) {
            if (!byType.has(s.type)) byType.set(s.type, [])
            byType.get(s.type)!.push(s)
        }
        return byType
    }, [])

    const filteredSpells = useMemo(() => {
        const source = filter === 'All' ? SPELLS : grouped.get(filter) ?? []
        // Sort by minLevel asc, then name asc within a level — closer to
        // how the in-game menu groups them.
        return [...source].sort((a, b) =>
            (a.minLevel - b.minLevel) || a.name.localeCompare(b.name)
        )
    }, [filter, grouped])

    if (loading) return <LoadingSpinner />

    if (!data || data.spellIds == null) {
        return (
            <p className="text-gray-400 text-xs py-2">
                No spell data captured yet — run a sync to populate.
            </p>
        )
    }

    const totalKnown = data.spellIds.length

    return (
        <div className="space-y-2 text-xs">
            <div className="text-gray-400">
                <span className="text-gray-100 font-semibold tabular-nums">{totalKnown}</span>
                <span className="ml-1">/ {SPELLS.length} known</span>
            </div>

            <div className="flex flex-wrap gap-1">
                {(['All', ...TYPE_ORDER] as const).map(t => {
                    const count = t === 'All'
                        ? SPELLS.filter(s => knownSet.has(s.id)).length
                        : (grouped.get(t) ?? []).filter(s => knownSet.has(s.id)).length
                    const total = t === 'All' ? SPELLS.length : (grouped.get(t) ?? []).length
                    const label = t === 'All' ? 'All' : SPELL_TYPE_LABELS[t]
                    return (
                        <button
                            key={t}
                            onClick={() => setFilter(t)}
                            className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                                filter === t
                                    ? 'bg-blue-500/30 text-blue-200 border border-blue-500/50'
                                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                            }`}
                        >
                            {label} {count}/{total}
                        </button>
                    )
                })}
            </div>

            <ul className="divide-y divide-gray-800/60">
                {filteredSpells.map(s => {
                    const known = knownSet.has(s.id)
                    return (
                        <li key={s.id} className="px-1 py-1 flex items-baseline gap-2">
                            <span className={`w-3 text-center ${known ? 'text-emerald-400' : 'text-gray-700'}`}>
                                {known ? '✓' : '·'}
                            </span>
                            <span className={`flex-1 truncate ${known ? 'text-gray-200' : 'text-gray-500'}`}>
                                {s.name}
                            </span>
                            {s.type !== 'Trust' && (
                                <span className="text-gray-500 tabular-nums w-12 text-right">
                                    Lv {s.minLevel}
                                </span>
                            )}
                            {s.mpCost > 0 && (
                                <span className="text-gray-500 tabular-nums w-10 text-right">
                                    {s.mpCost} MP
                                </span>
                            )}
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
