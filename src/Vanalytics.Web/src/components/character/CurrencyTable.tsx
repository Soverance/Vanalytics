import { useMemo, useState } from 'react'
import {
    listCurrencies,
    CURRENCY_CATEGORY_LABELS,
    type CurrencyCategory,
    type CurrencyListEntry,
} from '../../lib/currencies'

const NEAR_CAP_PCT = 90

type SortKey = 'name' | 'value' | 'category' | 'pct'

export default function CurrencyTable({ currencies }: { currencies: Record<string, number> }) {
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState<CurrencyCategory | 'all'>('all')
    const [sort, setSort] = useState<SortKey>('name')
    const [hideZero, setHideZero] = useState(true)
    const [nearCapOnly, setNearCapOnly] = useState(false)

    const rows = useMemo(() => {
        let list: CurrencyListEntry[] = listCurrencies(currencies)

        if (hideZero) list = list.filter(r => r.value !== 0)
        if (category !== 'all') list = list.filter(r => r.entry.category === category)
        if (nearCapOnly) list = list.filter(r => r.pctOfCap != null && r.pctOfCap >= NEAR_CAP_PCT)
        if (search.trim()) {
            const q = search.trim().toLowerCase()
            list = list.filter(r => r.entry.name.toLowerCase().includes(q))
        }

        const sorted = [...list]
        sorted.sort((a, b) => {
            switch (sort) {
                case 'value': return b.value - a.value
                case 'category': return a.entry.category.localeCompare(b.entry.category) || a.entry.name.localeCompare(b.entry.name)
                case 'pct': return (b.pctOfCap ?? -1) - (a.pctOfCap ?? -1)
                default: return a.entry.name.localeCompare(b.entry.name)
            }
        })
        return sorted
    }, [currencies, search, category, sort, hideZero, nearCapOnly])

    const categories = Object.keys(CURRENCY_CATEGORY_LABELS) as CurrencyCategory[]

    return (
        <div>
            <div className="flex flex-wrap gap-2 items-center mb-3">
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search currencies…"
                    className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm text-gray-200 placeholder-gray-500"
                />
                <select
                    value={category}
                    onChange={e => setCategory(e.target.value as CurrencyCategory | 'all')}
                    className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm text-gray-200"
                >
                    <option value="all">All categories</option>
                    {categories.map(c => <option key={c} value={c}>{CURRENCY_CATEGORY_LABELS[c]}</option>)}
                </select>
                <select
                    value={sort}
                    onChange={e => setSort(e.target.value as SortKey)}
                    className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm text-gray-200"
                >
                    <option value="name">Sort: Name</option>
                    <option value="value">Sort: Value</option>
                    <option value="category">Sort: Category</option>
                    <option value="pct">Sort: % of cap</option>
                </select>
                <label className="flex items-center gap-1 text-xs text-gray-400">
                    <input type="checkbox" checked={hideZero} onChange={e => setHideZero(e.target.checked)} />
                    Hide zero
                </label>
                <label className="flex items-center gap-1 text-xs text-gray-400">
                    <input type="checkbox" checked={nearCapOnly} onChange={e => setNearCapOnly(e.target.checked)} />
                    Near cap
                </label>
            </div>

            {rows.length === 0 ? (
                <p className="text-gray-500 text-sm">No currencies match.</p>
            ) : (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-800 text-gray-400 text-xs uppercase">
                            <th className="px-3 py-2 text-left">Currency</th>
                            <th className="px-3 py-2 text-left">Category</th>
                            <th className="px-3 py-2 text-right">Value</th>
                            <th className="px-3 py-2 text-right">Cap</th>
                            <th className="px-3 py-2 text-right">% of cap</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ entry, value, pctOfCap }) => {
                            const nearCap = pctOfCap != null && pctOfCap >= NEAR_CAP_PCT
                            return (
                                <tr key={entry.key} className="border-t border-gray-700/50">
                                    <td className="px-3 py-1.5 text-gray-100 font-medium">{entry.name}</td>
                                    <td className="px-3 py-1.5 text-gray-400">{CURRENCY_CATEGORY_LABELS[entry.category]}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-200">{value.toLocaleString()}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                                        {entry.cap != null ? entry.cap.toLocaleString() : '—'}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">
                                        {pctOfCap != null ? (
                                            <span className={nearCap ? 'text-amber-300' : 'text-gray-400'}>
                                                {Math.min(pctOfCap, 100).toFixed(0)}%
                                            </span>
                                        ) : <span className="text-gray-600">—</span>}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            )}
        </div>
    )
}
