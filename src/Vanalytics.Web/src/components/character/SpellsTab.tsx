import { useState, useEffect, useMemo, Fragment } from 'react'
import { api } from '../../api/client'
import type { CollectionResponse } from '../../types/api'
import LoadingSpinner from '../LoadingSpinner'
import { SPELLS, SPELL_TYPE_LABELS, spellWikiUrl, isScrollLearnable, isObtainable, type SpellType } from '../../lib/spells'

interface Props {
    characterId: string
    fetchBase?: string
}

const TYPE_ORDER: SpellType[] = [
    'WhiteMagic', 'BlackMagic', 'SummonerPact', 'Ninjutsu',
    'BardSong', 'BlueMagic', 'Geomancy', 'Trust',
]

type StatusFilter = 'all' | 'known' | 'unknown' | 'npcOnly'

export default function SpellsTab({ characterId, fetchBase }: Props) {
    const base = fetchBase ?? `/api/characters/${characterId}`
    const [data, setData] = useState<CollectionResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [typeFilter, setTypeFilter] = useState<SpellType | 'All'>('All')
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [expandedId, setExpandedId] = useState<number | null>(null)

    useEffect(() => {
        setLoading(true)
        api<CollectionResponse>(`${base}/collection`)
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false))
    }, [base])

    // Close the detail panel on Escape.
    useEffect(() => {
        if (expandedId == null) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedId(null) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [expandedId])

    // Collapse any open panel when the visible set changes, so a panel can't
    // linger on a row the user has filtered away.
    useEffect(() => { setExpandedId(null) }, [typeFilter, statusFilter, search])

    const knownSet = useMemo(() => new Set(data?.spellIds ?? []), [data])

    const obtainableSpells = useMemo(() => SPELLS.filter(isObtainable), [])
    const npcOnlySpells = useMemo(() => SPELLS.filter(s => !isObtainable(s)), [])

    const byType = useMemo(() => {
        const map = new Map<SpellType, typeof SPELLS>()
        for (const s of obtainableSpells) {
            if (!map.has(s.type)) map.set(s.type, [])
            map.get(s.type)!.push(s)
        }
        return map
    }, [obtainableSpells])

    const filteredSpells = useMemo(() => {
        let pool: typeof SPELLS
        if (statusFilter === 'npcOnly') {
            pool = typeFilter === 'All'
                ? npcOnlySpells
                : npcOnlySpells.filter(s => s.type === typeFilter)
        } else {
            pool = typeFilter === 'All' ? obtainableSpells : byType.get(typeFilter) ?? []
            if (statusFilter === 'known') pool = pool.filter(s => knownSet.has(s.id))
            else if (statusFilter === 'unknown') pool = pool.filter(s => !knownSet.has(s.id))
        }
        const q = search.trim().toLowerCase()
        if (q) pool = pool.filter(s => s.name.toLowerCase().includes(q))
        return [...pool].sort((a, b) =>
            (a.minLevel - b.minLevel) || a.name.localeCompare(b.name)
        )
    }, [typeFilter, statusFilter, search, byType, knownSet, obtainableSpells, npcOnlySpells])

    if (loading) return <LoadingSpinner />

    if (!data || data.spellIds == null) {
        return (
            <p className="text-gray-400 text-sm">
                No spell data captured yet. Run a sync to populate — Vanalytics reads your
                known spells (including trusts) directly from Windower on each sync, no
                zoning required.
            </p>
        )
    }

    const obtainableKnownIds = data.spellIds.filter(id => {
        const s = SPELLS.find(sp => sp.id === id)
        return s ? isObtainable(s) : true
    })
    const totalKnown = obtainableKnownIds.length
    const colCount = typeFilter === 'All' ? 5 : 4

    return (
        <div className="space-y-3 pr-2">
            {/* Header row: counts + search */}
            <div className="flex items-center gap-4 flex-wrap">
                <div>
                    <span className="text-2xl font-semibold text-gray-100 tabular-nums">{totalKnown}</span>
                    <span className="text-sm text-gray-500 ml-1">/ {obtainableSpells.length} known</span>
                </div>
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search spells..."
                    className="flex-1 min-w-[180px] rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <div className="flex gap-1">
                    {(['all', 'known', 'unknown', 'npcOnly'] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`px-2 py-1 rounded text-xs transition-colors ${
                                statusFilter === s
                                    ? 'bg-blue-500/30 text-blue-200 border border-blue-500/50'
                                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                            }`}
                        >
                            {s === 'npcOnly' ? 'NPC-only' : s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Type filter pills */}
            <div className="flex flex-wrap gap-1.5">
                {(['All', ...TYPE_ORDER] as const).map(t => {
                    const pool = t === 'All' ? obtainableSpells : byType.get(t) ?? []
                    const known = pool.filter(s => knownSet.has(s.id)).length
                    const label = t === 'All' ? 'All' : SPELL_TYPE_LABELS[t]
                    return (
                        <button
                            key={t}
                            onClick={() => setTypeFilter(t)}
                            className={`px-2 py-0.5 rounded text-xs transition-colors ${
                                typeFilter === t
                                    ? 'bg-blue-500/30 text-blue-200 border border-blue-500/50'
                                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                            }`}
                        >
                            {label} {known}/{pool.length}
                        </button>
                    )
                })}
            </div>

            {/* Spell table */}
            <div className="rounded border border-gray-700/60 bg-gray-900/30">
                {filteredSpells.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-gray-500">No spells match the current filter.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-800/60 text-gray-400 text-xs uppercase">
                                <th className="px-3 py-2 text-left w-8"></th>
                                <th className="px-3 py-2 text-left">Spell</th>
                                {typeFilter === 'All' && (
                                    <th className="px-3 py-2 text-left w-32">Type</th>
                                )}
                                <th className="px-3 py-2 text-right w-16">Level</th>
                                <th className="px-3 py-2 text-right w-16">MP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSpells.map(s => {
                                const known = knownSet.has(s.id)
                                const isOpen = expandedId === s.id
                                return (
                                    <Fragment key={s.id}>
                                        <tr
                                            onClick={() => setExpandedId(isOpen ? null : s.id)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault()
                                                    setExpandedId(isOpen ? null : s.id)
                                                }
                                            }}
                                            tabIndex={0}
                                            aria-expanded={isOpen}
                                            className="border-t border-gray-800/60 cursor-pointer hover:bg-gray-800/40 focus:outline-none focus:bg-gray-800/40"
                                        >
                                            <td className="px-3 py-1.5 text-center">
                                                <span className={known ? 'text-emerald-400' : 'text-gray-700'}>
                                                    {known ? '✓' : '·'}
                                                </span>
                                            </td>
                                            <td className={`px-3 py-1.5 ${known ? 'text-gray-100' : 'text-gray-500'}`}>
                                                {s.name}
                                                {s.npcOnly && (
                                                    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-gray-700/50 text-gray-400 align-middle">
                                                        NPC-only
                                                    </span>
                                                )}
                                            </td>
                                            {typeFilter === 'All' && (
                                                <td className="px-3 py-1.5 text-gray-500 text-xs">
                                                    {SPELL_TYPE_LABELS[s.type]}
                                                </td>
                                            )}
                                            <td className="px-3 py-1.5 text-right text-gray-500 tabular-nums">
                                                {s.type === 'Trust' ? '—' : s.minLevel}
                                            </td>
                                            <td className="px-3 py-1.5 text-right text-gray-500 tabular-nums">
                                                {s.mpCost > 0 ? s.mpCost : '—'}
                                            </td>
                                        </tr>
                                        {isOpen && (
                                            <tr className="bg-gray-900/40">
                                                <td colSpan={colCount} className="px-3 pb-2.5 pt-1 text-xs">
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-gray-200 font-medium">{s.name}</span>
                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                                                known ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-700/50 text-gray-400'
                                                            }`}>
                                                                {known ? 'Known' : 'Not learned'}
                                                            </span>
                                                        </div>
                                                        <div className="text-gray-500">
                                                            {SPELL_TYPE_LABELS[s.type]}
                                                            {s.type !== 'Trust' && ` · Lv.${s.minLevel}`}
                                                            {s.mpCost > 0 && ` · ${s.mpCost} MP`}
                                                        </div>
                                                        <a
                                                            href={spellWikiUrl(s)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-block text-blue-400 hover:text-blue-300 hover:underline"
                                                        >
                                                            {isScrollLearnable(s.type)
                                                                ? 'View scroll on BG-Wiki ↗'
                                                                : 'View spell on BG-Wiki ↗'}
                                                        </a>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}
