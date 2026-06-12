import { useState, useEffect, useMemo } from 'react'
import { api } from '../../api/client'
import type { TitlesResponse } from '../../types/api'
import LoadingSpinner from '../LoadingSpinner'
import { TITLES, TITLE_CONTENT_CATEGORIES, lookupTitle } from '../../lib/titles'

interface Props {
    characterId: string
    fetchBase?: string
}

function formatDate(iso: string): string {
    // The sync stores ISO timestamps; display as YYYY-MM-DD for the list.
    return iso.slice(0, 10)
}

export default function TitlesTab({ characterId, fetchBase }: Props) {
    const base = fetchBase ?? `/api/characters/${characterId}`
    const [data, setData] = useState<TitlesResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<string>('All')

    useEffect(() => {
        setLoading(true)
        api<TitlesResponse>(`${base}/titles`)
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false))
    }, [base])

    // Merge backend "obtained" rows with catalog metadata. Unknown IDs fall
    // back to "Title #N" via lookupTitle.
    const rows = useMemo(() => {
        if (!data?.titles) return []
        return data.titles.map(t => {
            const catalog = lookupTitle(t.titleId)
            return {
                titleId: t.titleId,
                name: catalog.name,
                content: catalog.content,
                howTo: catalog.howTo,
                firstSeenAt: t.firstSeenAt,
                lastEquippedAt: t.lastEquippedAt,
            }
        })
    }, [data])

    // Content categories the player actually has titles in (filter pills
    // hide categories with zero matches).
    const presentCategories = useMemo(() => {
        const present = new Set(rows.map(r => r.content))
        return TITLE_CONTENT_CATEGORIES.filter(c => present.has(c))
    }, [rows])

    const filtered = filter === 'All' ? rows : rows.filter(r => r.content === filter)
    const knownTotal = TITLES.length

    if (loading) return <LoadingSpinner />

    if (!data || data.titles.length === 0) {
        return (
            <p className="text-gray-400 text-sm">
                No titles captured yet. Titles are accumulated over time — every sync records
                whichever title is currently equipped. To build your collection: equip a title
                in-game, wait for the next sync, then equip another. The list grows as you
                cycle through your obtained titles.
            </p>
        )
    }

    return (
        <div className="space-y-3 pr-2">
            {/* Header row: counts + current */}
            <div className="flex justify-between items-baseline">
                <div>
                    <span className="text-2xl font-semibold text-gray-100 tabular-nums">{data.titles.length}</span>
                    <span className="text-sm text-gray-500 ml-1">/ {knownTotal} known titles</span>
                </div>
                {data.currentTitleId != null && data.currentTitleId > 0 && (
                    <div className="text-xs text-gray-400">
                        Currently equipped:{' '}
                        <span className="text-amber-300 font-medium">
                            {lookupTitle(data.currentTitleId).name}
                        </span>
                    </div>
                )}
            </div>

            {/* Filter pills */}
            <div className="flex flex-wrap gap-1.5">
                <button
                    onClick={() => setFilter('All')}
                    className={`px-2 py-0.5 rounded text-xs transition-colors ${
                        filter === 'All'
                            ? 'bg-blue-500/30 text-blue-200 border border-blue-500/50'
                            : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                    }`}
                >
                    All ({rows.length})
                </button>
                {presentCategories.map(cat => {
                    const count = rows.filter(r => r.content === cat).length
                    return (
                        <button
                            key={cat}
                            onClick={() => setFilter(cat)}
                            className={`px-2 py-0.5 rounded text-xs transition-colors ${
                                filter === cat
                                    ? 'bg-blue-500/30 text-blue-200 border border-blue-500/50'
                                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                            }`}
                        >
                            {cat} ({count})
                        </button>
                    )
                })}
            </div>

            {/* Titles list */}
            <div className="rounded border border-gray-700/60 bg-gray-900/30">
                {filtered.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-500">No titles in this category.</p>
                ) : (
                    <ul className="divide-y divide-gray-800/60">
                        {filtered.map(r => {
                            const isEquipped = data.currentTitleId === r.titleId
                            return (
                                <li
                                    key={r.titleId}
                                    className="px-3 py-1.5 flex items-baseline gap-3 text-xs"
                                    title={r.howTo}
                                >
                                    <span className={`w-3 text-center ${isEquipped ? 'text-amber-300' : 'text-gray-700'}`}>
                                        {isEquipped ? '★' : '·'}
                                    </span>
                                    <span className={`flex-1 ${isEquipped ? 'text-amber-200 font-medium' : 'text-gray-200'} truncate`}>
                                        {r.name}
                                    </span>
                                    <span className="text-gray-500 text-[10px] uppercase tracking-wide w-32 truncate">
                                        {r.content}
                                    </span>
                                    <span className="text-gray-500 tabular-nums w-24 text-right">
                                        {formatDate(r.firstSeenAt)}
                                    </span>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>
        </div>
    )
}
