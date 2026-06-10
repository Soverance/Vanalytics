import { useState, useEffect, useMemo } from 'react'
import { api } from '../../api/client'
import type { CollectionResponse } from '../../types/api'
import LoadingSpinner from '../LoadingSpinner'
import { KEY_ITEMS, KEY_ITEM_CATEGORIES, keyItemWikiUrl, type KeyItemCategory } from '../../lib/key-items'
import { filterKeyItems } from './keyItemsFilters'

interface Props {
    characterId: string
    fetchBase?: string
}

export default function KeyItemsTab({ characterId, fetchBase }: Props) {
    const base = fetchBase ?? `/api/characters/${characterId}`
    const [data, setData] = useState<CollectionResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<KeyItemCategory | 'All'>('All')
    const [query, setQuery] = useState('')
    const [expandedId, setExpandedId] = useState<number | null>(null)

    useEffect(() => {
        setLoading(true)
        api<CollectionResponse>(`${base}/collection`)
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false))
    }, [base])

    const heldSet = useMemo(() => new Set(data?.keyItemIds ?? []), [data])

    const byCategory = useMemo(() => {
        const map = new Map<KeyItemCategory, typeof KEY_ITEMS>()
        for (const ki of KEY_ITEMS) {
            if (!map.has(ki.category)) map.set(ki.category, [])
            map.get(ki.category)!.push(ki)
        }
        return map
    }, [])

    const filtered = useMemo(
        () => filterKeyItems(KEY_ITEMS, filter, query),
        [filter, query]
    )

    // Close the detail panel on Escape.
    useEffect(() => {
        if (expandedId == null) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedId(null) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [expandedId])

    // Collapse any open detail panel when the visible set changes, so a panel
    // can't linger (or silently reopen) on a row the user has filtered away.
    useEffect(() => { setExpandedId(null) }, [filter, query])

    if (loading) return <LoadingSpinner />

    if (!data || data.keyItemIds == null) {
        return (
            <p className="text-gray-400 text-sm">
                No key item data captured yet. Run a sync to populate — Vanalytics reads your
                key items directly from Windower on each sync, no zoning required.
            </p>
        )
    }

    const totalHeld = data.keyItemIds.length
    const searching = query.trim() !== ''
    const showCategoryLabel = filter === 'All' || searching

    return (
        <div className="space-y-3 pr-2">
            <div className="flex justify-between items-baseline">
                <div>
                    <span className="text-2xl font-semibold text-gray-100 tabular-nums">{totalHeld}</span>
                    <span className="text-sm text-gray-500 ml-1">obtained ({KEY_ITEMS.length} catalogued)</span>
                </div>
            </div>

            <div className="relative">
                <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search key items..."
                    className="w-full bg-gray-900/50 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/60"
                />
                {query && (
                    <button
                        type="button"
                        onClick={() => setQuery('')}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                    >
                        ×
                    </button>
                )}
            </div>

            <div className="flex flex-wrap gap-1.5">
                <button
                    onClick={() => setFilter('All')}
                    className={`px-2 py-0.5 rounded text-xs transition-colors ${
                        filter === 'All'
                            ? 'bg-blue-500/30 text-blue-200 border border-blue-500/50'
                            : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                    }`}
                >
                    All ({KEY_ITEMS.filter(k => heldSet.has(k.id)).length})
                </button>
                {KEY_ITEM_CATEGORIES.map(cat => {
                    const items = byCategory.get(cat) ?? []
                    const held = items.filter(k => heldSet.has(k.id)).length
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
                            {cat} ({held}/{items.length})
                        </button>
                    )
                })}
            </div>

            {searching && (
                <p className="text-xs text-gray-500" aria-live="polite">
                    {filtered.length} match{filtered.length === 1 ? '' : 'es'}
                </p>
            )}

            <div className="rounded border border-gray-700/60 bg-gray-900/30">
                {filtered.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-500">
                        {searching ? 'No key items match.' : 'No key items in this category.'}
                    </p>
                ) : (
                    <ul className="divide-y divide-gray-800/60">
                        {filtered.map(k => {
                            const held = heldSet.has(k.id)
                            const isOpen = expandedId === k.id
                            return (
                                <li key={k.id}>
                                    <button
                                        type="button"
                                        onClick={() => setExpandedId(isOpen ? null : k.id)}
                                        aria-expanded={isOpen}
                                        className="w-full px-3 py-1.5 flex items-baseline gap-3 text-xs text-left hover:bg-gray-800/40 transition-colors"
                                    >
                                        <span className={`w-3 text-center ${held ? 'text-emerald-400' : 'text-gray-700'}`}>
                                            {held ? '✓' : '·'}
                                        </span>
                                        <span className={`flex-1 ${held ? 'text-gray-200' : 'text-gray-500'} truncate`}>
                                            {k.name}
                                        </span>
                                        {showCategoryLabel && (
                                            <span className="text-gray-500 text-[10px] uppercase tracking-wide w-32 truncate">
                                                {k.category}
                                            </span>
                                        )}
                                    </button>
                                    {isOpen && (
                                        <div className="px-3 pb-2.5 pt-1 bg-gray-900/40 text-xs space-y-1.5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-200 font-medium">{k.name}</span>
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                                    held ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-700/50 text-gray-400'
                                                }`}>
                                                    {held ? 'Obtained' : 'Not obtained'}
                                                </span>
                                            </div>
                                            <div className="text-gray-500">{k.category}</div>
                                            <a
                                                href={keyItemWikiUrl(k.name)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-block text-blue-400 hover:text-blue-300 hover:underline"
                                            >
                                                View on BG-Wiki ↗
                                            </a>
                                        </div>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>
        </div>
    )
}
