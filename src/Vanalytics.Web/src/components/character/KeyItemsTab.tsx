import { useState, useEffect, useMemo } from 'react'
import { api } from '../../api/client'
import type { CollectionResponse } from '../../types/api'
import LoadingSpinner from '../LoadingSpinner'
import { KEY_ITEMS, KEY_ITEM_CATEGORIES, type KeyItemCategory } from '../../lib/key-items'

interface Props {
    characterId: string
    fetchBase?: string
}

export default function KeyItemsTab({ characterId, fetchBase }: Props) {
    const base = fetchBase ?? `/api/characters/${characterId}`
    const [data, setData] = useState<CollectionResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<KeyItemCategory | 'All'>('All')

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

    const filtered = useMemo(() => {
        const source = filter === 'All' ? KEY_ITEMS : byCategory.get(filter) ?? []
        return [...source].sort((a, b) => a.name.localeCompare(b.name))
    }, [filter, byCategory])

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

    return (
        <div className="space-y-3 pr-2">
            <div className="flex justify-between items-baseline">
                <div>
                    <span className="text-2xl font-semibold text-gray-100 tabular-nums">{totalHeld}</span>
                    <span className="text-sm text-gray-500 ml-1">obtained ({KEY_ITEMS.length} catalogued)</span>
                </div>
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

            <div className="rounded border border-gray-700/60 bg-gray-900/30">
                {filtered.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-500">No key items in this category.</p>
                ) : (
                    <ul className="divide-y divide-gray-800/60">
                        {filtered.map(k => {
                            const held = heldSet.has(k.id)
                            return (
                                <li
                                    key={k.id}
                                    className="px-3 py-1.5 flex items-baseline gap-3 text-xs"
                                >
                                    <span className={`w-3 text-center ${held ? 'text-emerald-400' : 'text-gray-700'}`}>
                                        {held ? '✓' : '·'}
                                    </span>
                                    <span className={`flex-1 ${held ? 'text-gray-200' : 'text-gray-500'} truncate`}>
                                        {k.name}
                                    </span>
                                    {filter === 'All' && (
                                        <span className="text-gray-500 text-[10px] uppercase tracking-wide w-32 truncate">
                                            {k.category}
                                        </span>
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
