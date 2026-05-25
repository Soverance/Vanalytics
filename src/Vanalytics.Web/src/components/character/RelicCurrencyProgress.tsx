import { useState, useEffect, useMemo } from 'react'
import { api } from '../../api/client'
import type { InventoryByBag, RelicsResponse } from '../../types/api'
import {
    RELIC_PROGRESSIONS,
    type RelicProgression,
    type RelicTransition,
    totalChainCost,
} from '../../lib/relic-progression'
import {
    CURRENCY_BY_ID,
    availableForCurrency,
    type DynamisCurrency,
} from '../../lib/dynamis-currency'

interface Props {
    characterId: string
    relics: RelicsResponse
}

interface RelicState {
    relic: RelicProgression
    // Stage in the currency chain (0..4). 0 = drop only, 4 = Lv.75 base owned.
    // Equal to -1 if no stage held AND no higher-tier post-75 form held.
    currentStageIndex: number
    // True if any post-Lv.75 form (Lv.80+/Reforged/Afterglow) is held — implies
    // the currency chain is fully complete.
    postSeventyFiveHeld: boolean
}

function deriveCurrentStage(
    relic: RelicProgression,
    inventoryItemIds: Set<number>,
    relicsByBaseName: Map<string, { hasAnyVersion: boolean }>,
): RelicState {
    // If any Lv.75+ version of the final relic is currently held per the
    // existing classifier, the currency chain is complete.
    const relicData = relicsByBaseName.get(relic.baseName)
    const postSeventyFiveHeld = relicData?.hasAnyVersion ?? false

    // Otherwise scan inventory for the 5 pre/final stage items.
    let highestStage = -1
    for (let i = 0; i < relic.stages.length; i++) {
        if (inventoryItemIds.has(relic.stages[i])) {
            highestStage = i
        }
    }

    return { relic, currentStageIndex: highestStage, postSeventyFiveHeld }
}

// Displays held vs required in the cost currency's native tier units
// (e.g., "15/61 L. Jadeshell"). `haveTierOne` is the player's total holding
// rolled up to tier-1 equivalents for the same nation.
function CurrencyChip({ currency, haveTierOne, needAmount }: { currency: DynamisCurrency; haveTierOne: number; needAmount: number }) {
    const haveInTier = haveTierOne / currency.tier
    const ok = haveInTier >= needAmount
    const haveDisplay = haveInTier >= 1 || haveInTier === 0
        ? Math.floor(haveInTier).toLocaleString()
        : haveInTier.toFixed(2)
    return (
        <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${ok ? 'bg-green-900/40 text-green-300' : 'bg-gray-800 text-gray-300'}`}>
            <span className="font-mono">{haveDisplay}/{needAmount.toLocaleString()}</span>
            <span className="text-gray-400">{currency.name}</span>
        </span>
    )
}

function StageProgressBar({ pct, complete }: { pct: number; complete: boolean }) {
    return (
        <div className="h-1.5 rounded-full bg-gray-700 overflow-hidden">
            <div
                className={`h-full rounded-full transition-all ${complete ? 'bg-green-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(100, pct)}%` }}
            />
        </div>
    )
}

function TransitionDetail({ transition, counts }: { transition: RelicTransition; counts: Map<number, number> }) {
    return (
        <div className="text-xs space-y-1">
            <div className="flex flex-wrap gap-1">
                {transition.currencies.map(cost => {
                    const currency = CURRENCY_BY_ID[cost.currencyItemId]
                    if (!currency) return null
                    const haveTierOne = availableForCurrency(currency, counts)
                    return <CurrencyChip key={cost.currencyItemId} currency={currency} haveTierOne={haveTierOne} needAmount={cost.amount} />
                })}
            </div>
            {transition.otherItems.length > 0 && (
                <div className="text-gray-400">
                    Also needed: {transition.otherItems.map((item, i) => (
                        <span key={i}>
                            {i > 0 && ', '}
                            <span className="text-gray-300">{item.name}</span>
                            {item.note && <span className="text-gray-500"> ({item.note})</span>}
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}

// Use the final Lv.75 base relic's icon for the card. Item images are
// served at /item-images/icons/{itemId}.png per LocalItemImageStore.
function relicIconUrl(relic: RelicProgression): string {
    const finalStageId = relic.stages[relic.stages.length - 1]
    return `/item-images/icons/${finalStageId}.png`
}

function RelicIdentity({ relic }: { relic: RelicProgression }) {
    return (
        <div className="flex items-center gap-2 min-w-0">
            <img
                src={relicIconUrl(relic)}
                alt=""
                className="w-8 h-auto object-contain flex-shrink-0"
                loading="lazy"
            />
            <div className="min-w-0">
                <div className="text-gray-100 font-medium truncate">{relic.baseName}</div>
                <div className="text-gray-500 text-xs truncate">{relic.job} • {relic.weaponType}</div>
            </div>
        </div>
    )
}

function RelicCard({ state, counts }: { state: RelicState; counts: Map<number, number> }) {
    const [expanded, setExpanded] = useState(false)
    const { relic, currentStageIndex, postSeventyFiveHeld } = state

    // Complete: currency chain done (post-75 form held OR final stage in inventory)
    const complete = postSeventyFiveHeld || currentStageIndex === relic.stages.length - 1
    // Not started: no drop, no upgrades, no post-75 form
    const notStarted = !complete && currentStageIndex === -1

    if (complete) {
        return (
            <div className="border border-gray-700 bg-gray-800/50 rounded p-3">
                <div className="flex justify-between items-center gap-2">
                    <RelicIdentity relic={relic} />
                    <span className="text-xs px-2 py-0.5 rounded bg-green-900/40 text-green-300 flex-shrink-0">
                        ★ Currency chain complete
                    </span>
                </div>
            </div>
        )
    }

    if (notStarted) {
        const total = totalChainCost(relic)
        const totalsList = [
            { label: 'Bastok bynes', value: total.Bastok },
            { label: "Sandy", value: total["San d'Oria"] },
            { label: 'Windy', value: total.Windurst },
        ].filter(t => t.value > 0)
        return (
            <div className="border border-gray-700 bg-gray-800/50 rounded p-3">
                <div className="flex justify-between items-start gap-2">
                    <RelicIdentity relic={relic} />
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400 flex-shrink-0">
                        Not started
                    </span>
                </div>
                <div className="mt-1.5 text-xs text-gray-400">
                    Requires Dynamis drop. Full path: {totalsList.map((t, i) => (
                        <span key={t.label}>
                            {i > 0 && ', '}
                            <span className="font-mono text-gray-300">{t.value.toLocaleString()}</span> {t.label}
                        </span>
                    ))}
                </div>
            </div>
        )
    }

    // In-progress: show next transition
    const nextTransition = relic.transitions[currentStageIndex]
    const remainingTransitions = relic.transitions.slice(currentStageIndex + 1)

    // Progress: the dominant currency in the next transition (largest tier-1
    // equivalent cost) drives the bar. Aegis has multi-currency stages -- take
    // the worst-coverage currency as the bottleneck.
    let worstPct = 100
    for (const cost of nextTransition.currencies) {
        const currency = CURRENCY_BY_ID[cost.currencyItemId]
        if (!currency) continue
        const have = availableForCurrency(currency, counts)
        const need = currency.tier * cost.amount
        const pct = need > 0 ? Math.min(100, (have / need) * 100) : 100
        if (pct < worstPct) worstPct = pct
    }

    return (
        <div className="border border-gray-700 bg-gray-800/50 rounded p-3">
            <div className="flex justify-between items-center gap-2 mb-2">
                <RelicIdentity relic={relic} />
                <span className="text-xs px-2 py-0.5 rounded bg-amber-900/40 text-amber-300 flex-shrink-0">
                    Stage {currentStageIndex + 1} of {relic.stages.length - 1}
                </span>
            </div>

            <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Next: stage {currentStageIndex + 2}</span>
                    <span className="font-mono">{Math.floor(worstPct)}%</span>
                </div>
                <StageProgressBar pct={worstPct} complete={worstPct >= 100} />
            </div>

            <TransitionDetail transition={nextTransition} counts={counts} />

            {remainingTransitions.length > 0 && (
                <div className="mt-2">
                    <button
                        onClick={() => setExpanded(e => !e)}
                        className="text-xs text-blue-400 hover:text-blue-300"
                    >
                        {expanded ? 'Hide' : `Show`} {remainingTransitions.length} remaining stage{remainingTransitions.length === 1 ? '' : 's'}
                    </button>
                    {expanded && (
                        <div className="mt-2 space-y-2 pl-3 border-l-2 border-gray-700">
                            {remainingTransitions.map((t, i) => (
                                <div key={i}>
                                    <div className="text-xs text-gray-500 mb-1">
                                        Stage {currentStageIndex + 2 + i} → {currentStageIndex + 3 + i}
                                    </div>
                                    <TransitionDetail transition={t} counts={counts} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default function RelicCurrencyProgress({ characterId, relics }: Props) {
    const [inventory, setInventory] = useState<InventoryByBag | null>(null)
    const [loading, setLoading] = useState(true)
    const [sortMode, setSortMode] = useState<'name' | 'progress'>('name')
    const [hideComplete, setHideComplete] = useState(false)

    useEffect(() => {
        setLoading(true)
        api<InventoryByBag>(`/api/characters/${characterId}/inventory`)
            .then(setInventory)
            .catch(() => setInventory(null))
            .finally(() => setLoading(false))
    }, [characterId])

    // Sum item counts across all bags. Stage items are RaRe so should appear
    // at most once, but currency stacks and can appear in multiple bags.
    const counts = useMemo(() => {
        const map = new Map<number, number>()
        if (!inventory) return map
        for (const bag of Object.values(inventory)) {
            for (const item of bag) {
                map.set(item.itemId, (map.get(item.itemId) ?? 0) + item.quantity)
            }
        }
        return map
    }, [inventory])

    // Lookup: which relics have any Lv.75+ version currently held? Sourced
    // from the existing classifier — final stage (Lv.75) and all higher forms
    // share the same BaseName.
    const relicHeld = useMemo(() => {
        const map = new Map<string, { hasAnyVersion: boolean }>()
        for (const weapon of relics.weapons) {
            if (weapon.category !== 'Relic') continue
            map.set(weapon.baseName, {
                hasAnyVersion: weapon.versions.some(v => v.currentlyHeld),
            })
        }
        return map
    }, [relics])

    const states = useMemo(() => {
        const inventoryIds = new Set(counts.keys())
        return RELIC_PROGRESSIONS.map(r => deriveCurrentStage(r, inventoryIds, relicHeld))
    }, [counts, relicHeld])

    const sortedStates = useMemo(() => {
        const filtered = hideComplete
            ? states.filter(s => !(s.postSeventyFiveHeld || s.currentStageIndex === s.relic.stages.length - 1))
            : states
        if (sortMode === 'name') {
            return [...filtered].sort((a, b) => a.relic.baseName.localeCompare(b.relic.baseName))
        }
        // sort by progress: started+incomplete first (by stage desc), then unstarted, then complete
        return [...filtered].sort((a, b) => {
            const aComplete = a.postSeventyFiveHeld || a.currentStageIndex === a.relic.stages.length - 1
            const bComplete = b.postSeventyFiveHeld || b.currentStageIndex === b.relic.stages.length - 1
            if (aComplete !== bComplete) return aComplete ? 1 : -1
            const aStarted = a.currentStageIndex >= 0
            const bStarted = b.currentStageIndex >= 0
            if (aStarted !== bStarted) return aStarted ? -1 : 1
            return b.currentStageIndex - a.currentStageIndex
        })
    }, [states, sortMode, hideComplete])

    const totalCount = states.length
    const completeCount = states.filter(s => s.postSeventyFiveHeld || s.currentStageIndex === s.relic.stages.length - 1).length
    const startedCount = states.filter(s => s.currentStageIndex >= 0 && !s.postSeventyFiveHeld && s.currentStageIndex < s.relic.stages.length - 1).length

    if (loading) {
        return <p className="text-gray-500 text-sm py-2">Loading relic currency progress…</p>
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h3 className="text-sm font-medium text-gray-200">Relic Currency Progress</h3>
                    <p className="text-xs text-gray-500">
                        {completeCount} complete • {startedCount} in progress • {totalCount - completeCount - startedCount} not started
                    </p>
                </div>
                <div className="flex gap-2 text-xs">
                    <label className="flex items-center gap-1 text-gray-400 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={hideComplete}
                            onChange={e => setHideComplete(e.target.checked)}
                            className="accent-amber-500"
                        />
                        Hide complete
                    </label>
                    <select
                        value={sortMode}
                        onChange={e => setSortMode(e.target.value as 'name' | 'progress')}
                        className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-300"
                    >
                        <option value="name">Sort: name</option>
                        <option value="progress">Sort: progress</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {sortedStates.map(s => (
                    <RelicCard key={s.relic.baseName} state={s} counts={counts} />
                ))}
            </div>
        </div>
    )
}

