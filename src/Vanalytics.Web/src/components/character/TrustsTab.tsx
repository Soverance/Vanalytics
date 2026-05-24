import { useState, useEffect, useMemo } from 'react'
import { api } from '../../api/client'
import type { CollectionResponse } from '../../types/api'
import LoadingSpinner from '../LoadingSpinner'
import { TRUSTS } from '../../lib/spells'

interface Props {
    characterId: string
}

// Trusts ARE spells (type='Trust') under the hood, so they come back in
// CollectionResponse.spellIds alongside regular magic. This tab is a
// dedicated first-class view of just the Trust subset.
export default function TrustsTab({ characterId }: Props) {
    const [data, setData] = useState<CollectionResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [showOnlyLearned, setShowOnlyLearned] = useState(false)

    useEffect(() => {
        setLoading(true)
        api<CollectionResponse>(`/api/characters/${characterId}/collection`)
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false))
    }, [characterId])

    const learnedSet = useMemo(() => new Set(data?.spellIds ?? []), [data])

    const rows = useMemo(() => {
        const sorted = [...TRUSTS].sort((a, b) => a.name.localeCompare(b.name))
        return showOnlyLearned ? sorted.filter(t => learnedSet.has(t.id)) : sorted
    }, [showOnlyLearned, learnedSet])

    if (loading) return <LoadingSpinner />

    if (!data || data.spellIds == null) {
        return (
            <p className="text-gray-400 text-sm">
                No trust data captured yet. Run a sync to populate — Vanalytics reads your
                known trusts from Windower's spell list on each sync.
            </p>
        )
    }

    const learned = TRUSTS.filter(t => learnedSet.has(t.id)).length

    return (
        <div className="space-y-3">
            <div className="flex justify-between items-baseline">
                <div>
                    <span className="text-2xl font-semibold text-gray-100 tabular-nums">{learned}</span>
                    <span className="text-sm text-gray-500 ml-1">/ {TRUSTS.length} trusts learned</span>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={showOnlyLearned}
                        onChange={e => setShowOnlyLearned(e.target.checked)}
                        className="accent-blue-500"
                    />
                    Show only learned
                </label>
            </div>

            <div className="rounded border border-gray-700/60 bg-gray-900/30 p-3">
                {rows.length === 0 ? (
                    <p className="text-xs text-gray-500 py-1">No trusts to display.</p>
                ) : (
                    <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                        {rows.map(t => {
                            const known = learnedSet.has(t.id)
                            return (
                                <li
                                    key={t.id}
                                    className="flex items-baseline gap-2"
                                >
                                    <span className={`w-3 text-center ${known ? 'text-emerald-400' : 'text-gray-700'}`}>
                                        {known ? '✓' : '·'}
                                    </span>
                                    <span className={`flex-1 truncate ${known ? 'text-gray-200' : 'text-gray-500'}`}>
                                        {t.name}
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
