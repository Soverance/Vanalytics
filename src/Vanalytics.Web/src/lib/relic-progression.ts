// Relic Weapon progression chains and currency costs (Dynamis-era).
//
// Each of the 16 relics has a 5-stage chain: drop item from Dynamis -> three
// currency-upgrade steps -> final Lv.75 base relic. After the Lv.75 base, the
// trial path (Lv.99 / Augmented / Reforged / Afterglow) takes over -- that
// progression is handled by UltimateWeaponStage.Derive on the backend, not
// here.
//
// Stage IDs sourced from Windower's Resources/items.lua. Currency costs
// sourced from https://www.bg-wiki.com/ffxi/Category:Relic_Weapons. Aegis
// uses a different mixed-currency + crafted-materials pattern (per-stage
// detail verified against individual BG-Wiki shield pages).
//
// Non-currency `otherItems` are documented per stage where verified; the 15
// non-Aegis relics may require additional crafted/dropped items at some
// stages that are not yet catalogued here. UI should render an empty
// otherItems[] as "see BG-Wiki for details" rather than implying the only
// cost is currency.

import { CURRENCY_BY_ID } from './dynamis-currency'

export interface CurrencyCost {
    currencyItemId: number
    amount: number
}

export interface OtherItemRequirement {
    name: string
    note?: string
}

export interface RelicTransition {
    fromItemId: number
    toItemId: number
    currencies: CurrencyCost[]
    otherItems: OtherItemRequirement[]
}

export interface RelicProgression {
    baseName: string           // matches UltimateWeapons.cs BaseName
    job: string                // primary user job, for display
    weaponType: string
    stages: number[]           // 5 item IDs: drop, +1, +2, +3, final
    transitions: RelicTransition[]   // 4 entries
}

// Helpers to keep the table below readable.
const cost = (currencyItemId: number, amount: number): CurrencyCost =>
    ({ currencyItemId, amount })

// Currency item IDs. Tier-1 (1×) singles aren't used in any relic transition
// — all upgrades take tier-2 (100×) or tier-3 (10,000×) stacks.
const BYNE_100   = 1456
const BYNE_10K   = 1457
const SILVER_100 = 1453
const GOLD_10K   = 1454
const JADE_100   = 1450
const STRIPE_10K = 1451

export const RELIC_PROGRESSIONS: RelicProgression[] = [
    {
        baseName: 'Spharai', job: 'MNK', weaponType: 'Hand-to-Hand',
        stages: [18260, 18261, 18262, 18263, 18264],
        transitions: [
            { fromItemId: 18260, toItemId: 18261, currencies: [cost(BYNE_100, 4)],   otherItems: [] },
            { fromItemId: 18261, toItemId: 18262, currencies: [cost(SILVER_100, 14)], otherItems: [] },
            { fromItemId: 18262, toItemId: 18263, currencies: [cost(JADE_100, 61)],   otherItems: [] },
            { fromItemId: 18263, toItemId: 18264, currencies: [cost(BYNE_10K, 1)],    otherItems: [] },
        ],
    },
    {
        baseName: 'Mandau', job: 'THF/RDM/BRD', weaponType: 'Dagger',
        stages: [18266, 18267, 18268, 18269, 18270],
        transitions: [
            { fromItemId: 18266, toItemId: 18267, currencies: [cost(BYNE_100, 4)],   otherItems: [] },
            { fromItemId: 18267, toItemId: 18268, currencies: [cost(SILVER_100, 14)], otherItems: [] },
            { fromItemId: 18268, toItemId: 18269, currencies: [cost(JADE_100, 61)],   otherItems: [] },
            { fromItemId: 18269, toItemId: 18270, currencies: [cost(BYNE_10K, 1)],    otherItems: [] },
        ],
    },
    {
        baseName: 'Excalibur', job: 'PLD/RDM', weaponType: 'Sword',
        stages: [18272, 18273, 18274, 18275, 18276],
        transitions: [
            { fromItemId: 18272, toItemId: 18273, currencies: [cost(SILVER_100, 4)], otherItems: [] },
            { fromItemId: 18273, toItemId: 18274, currencies: [cost(BYNE_100, 14)],  otherItems: [] },
            { fromItemId: 18274, toItemId: 18275, currencies: [cost(JADE_100, 61)],  otherItems: [] },
            { fromItemId: 18275, toItemId: 18276, currencies: [cost(GOLD_10K, 1)],   otherItems: [] },
        ],
    },
    {
        baseName: 'Ragnarok', job: 'WAR/PLD/DRK', weaponType: 'Great Sword',
        stages: [18278, 18279, 18280, 18281, 18282],
        transitions: [
            { fromItemId: 18278, toItemId: 18279, currencies: [cost(SILVER_100, 4)],  otherItems: [] },
            { fromItemId: 18279, toItemId: 18280, currencies: [cost(JADE_100, 16)],   otherItems: [] },
            { fromItemId: 18280, toItemId: 18281, currencies: [cost(BYNE_100, 61)],   otherItems: [] },
            { fromItemId: 18281, toItemId: 18282, currencies: [cost(GOLD_10K, 1)],    otherItems: [] },
        ],
    },
    {
        baseName: 'Guttler', job: 'BST', weaponType: 'Axe',
        stages: [18284, 18285, 18286, 18287, 18288],
        transitions: [
            { fromItemId: 18284, toItemId: 18285, currencies: [cost(JADE_100, 3)],    otherItems: [] },
            { fromItemId: 18285, toItemId: 18286, currencies: [cost(SILVER_100, 14)], otherItems: [] },
            { fromItemId: 18286, toItemId: 18287, currencies: [cost(BYNE_100, 60)],   otherItems: [] },
            { fromItemId: 18287, toItemId: 18288, currencies: [cost(STRIPE_10K, 1)],  otherItems: [] },
        ],
    },
    {
        baseName: 'Bravura', job: 'WAR', weaponType: 'Great Axe',
        stages: [18290, 18291, 18292, 18293, 18294],
        transitions: [
            { fromItemId: 18290, toItemId: 18291, currencies: [cost(BYNE_100, 3)],    otherItems: [] },
            { fromItemId: 18291, toItemId: 18292, currencies: [cost(JADE_100, 16)],   otherItems: [] },
            { fromItemId: 18292, toItemId: 18293, currencies: [cost(SILVER_100, 60)], otherItems: [] },
            { fromItemId: 18293, toItemId: 18294, currencies: [cost(BYNE_10K, 1)],    otherItems: [] },
        ],
    },
    {
        baseName: 'Apocalypse', job: 'DRK', weaponType: 'Scythe',
        stages: [18302, 18303, 18304, 18305, 18306],
        transitions: [
            { fromItemId: 18302, toItemId: 18303, currencies: [cost(JADE_100, 5)],    otherItems: [] },
            { fromItemId: 18303, toItemId: 18304, currencies: [cost(SILVER_100, 16)], otherItems: [] },
            { fromItemId: 18304, toItemId: 18305, currencies: [cost(BYNE_100, 62)],   otherItems: [] },
            { fromItemId: 18305, toItemId: 18306, currencies: [cost(STRIPE_10K, 1)],  otherItems: [] },
        ],
    },
    {
        baseName: 'Gungnir', job: 'DRG', weaponType: 'Polearm',
        stages: [18296, 18297, 18298, 18299, 18300],
        transitions: [
            { fromItemId: 18296, toItemId: 18297, currencies: [cost(JADE_100, 4)],    otherItems: [] },
            { fromItemId: 18297, toItemId: 18298, currencies: [cost(BYNE_100, 16)],   otherItems: [] },
            { fromItemId: 18298, toItemId: 18299, currencies: [cost(SILVER_100, 61)], otherItems: [] },
            { fromItemId: 18299, toItemId: 18300, currencies: [cost(STRIPE_10K, 1)],  otherItems: [] },
        ],
    },
    {
        baseName: 'Kikoku', job: 'NIN', weaponType: 'Katana',
        stages: [18308, 18309, 18310, 18311, 18312],
        transitions: [
            { fromItemId: 18308, toItemId: 18309, currencies: [cost(BYNE_100, 4)],    otherItems: [] },
            { fromItemId: 18309, toItemId: 18310, currencies: [cost(JADE_100, 16)],   otherItems: [] },
            { fromItemId: 18310, toItemId: 18311, currencies: [cost(SILVER_100, 61)], otherItems: [] },
            { fromItemId: 18311, toItemId: 18312, currencies: [cost(BYNE_10K, 1)],    otherItems: [] },
        ],
    },
    {
        baseName: 'Amanomurakumo', job: 'SAM', weaponType: 'Great Katana',
        stages: [18314, 18315, 18316, 18317, 18318],
        transitions: [
            { fromItemId: 18314, toItemId: 18315, currencies: [cost(SILVER_100, 3)],  otherItems: [] },
            { fromItemId: 18315, toItemId: 18316, currencies: [cost(JADE_100, 15)],   otherItems: [] },
            { fromItemId: 18316, toItemId: 18317, currencies: [cost(BYNE_100, 60)],   otherItems: [] },
            { fromItemId: 18317, toItemId: 18318, currencies: [cost(GOLD_10K, 1)],    otherItems: [] },
        ],
    },
    {
        baseName: 'Mjollnir', job: 'WHM', weaponType: 'Club',
        stages: [18320, 18321, 18322, 18323, 18324],
        transitions: [
            { fromItemId: 18320, toItemId: 18321, currencies: [cost(SILVER_100, 5)],  otherItems: [] },
            { fromItemId: 18321, toItemId: 18322, currencies: [cost(BYNE_100, 16)],   otherItems: [] },
            { fromItemId: 18322, toItemId: 18323, currencies: [cost(JADE_100, 62)],   otherItems: [] },
            { fromItemId: 18323, toItemId: 18324, currencies: [cost(GOLD_10K, 1)],    otherItems: [] },
        ],
    },
    {
        baseName: 'Claustrum', job: 'BLM/SMN', weaponType: 'Staff',
        stages: [18326, 18327, 18328, 18329, 18330],
        transitions: [
            { fromItemId: 18326, toItemId: 18327, currencies: [cost(JADE_100, 5)],    otherItems: [] },
            { fromItemId: 18327, toItemId: 18328, currencies: [cost(BYNE_100, 16)],   otherItems: [] },
            { fromItemId: 18328, toItemId: 18329, currencies: [cost(SILVER_100, 62)], otherItems: [] },
            { fromItemId: 18329, toItemId: 18330, currencies: [cost(STRIPE_10K, 1)],  otherItems: [] },
        ],
    },
    {
        // BG-Wiki shows two consecutive M. Silverpiece steps for Yoichinoyumi
        // (4 then 15) -- verify against in-game NPC trade if reachable.
        baseName: 'Yoichinoyumi', job: 'RNG/SAM', weaponType: 'Archery',
        stages: [18344, 18345, 18346, 18347, 18348],
        transitions: [
            { fromItemId: 18344, toItemId: 18345, currencies: [cost(SILVER_100, 4)],  otherItems: [] },
            { fromItemId: 18345, toItemId: 18346, currencies: [cost(SILVER_100, 15)], otherItems: [] },
            { fromItemId: 18346, toItemId: 18347, currencies: [cost(JADE_100, 61)],   otherItems: [] },
            { fromItemId: 18347, toItemId: 18348, currencies: [cost(GOLD_10K, 1)],    otherItems: [] },
        ],
    },
    {
        baseName: 'Annihilator', job: 'RNG', weaponType: 'Marksmanship',
        stages: [18332, 18333, 18334, 18335, 18336],
        transitions: [
            { fromItemId: 18332, toItemId: 18333, currencies: [cost(BYNE_100, 5)],    otherItems: [] },
            { fromItemId: 18333, toItemId: 18334, currencies: [cost(JADE_100, 15)],   otherItems: [] },
            { fromItemId: 18334, toItemId: 18335, currencies: [cost(SILVER_100, 62)], otherItems: [] },
            { fromItemId: 18335, toItemId: 18336, currencies: [cost(BYNE_10K, 1)],    otherItems: [] },
        ],
    },
    {
        baseName: 'Gjallarhorn', job: 'BRD', weaponType: 'String Instrument',
        stages: [18338, 18339, 18340, 18341, 18342],
        transitions: [
            { fromItemId: 18338, toItemId: 18339, currencies: [cost(JADE_100, 3)],    otherItems: [] },
            { fromItemId: 18339, toItemId: 18340, currencies: [cost(BYNE_100, 14)],   otherItems: [] },
            { fromItemId: 18340, toItemId: 18341, currencies: [cost(SILVER_100, 60)], otherItems: [] },
            { fromItemId: 18341, toItemId: 18342, currencies: [cost(STRIPE_10K, 1)],  otherItems: [] },
        ],
    },
    {
        // Aegis follows a different multi-currency + crafted-materials pattern
        // than the 15 weapon relics. Each currency-tier-2 stage uses ALL THREE
        // nation currencies at once; non-currency requirements vary per stage.
        baseName: 'Aegis', job: 'PLD', weaponType: 'Shield',
        stages: [15066, 15067, 15068, 15069, 15070],
        transitions: [
            {
                fromItemId: 15066, toItemId: 15067,
                currencies: [cost(SILVER_100, 1), cost(BYNE_100, 1), cost(JADE_100, 1)],
                otherItems: [
                    { name: 'Amaltheia Leather' },
                    { name: 'Orichalcum Sheet' },
                    { name: 'Ancient Lumber' },
                ],
            },
            {
                fromItemId: 15067, toItemId: 15068,
                currencies: [cost(SILVER_100, 4), cost(BYNE_100, 4), cost(JADE_100, 4)],
                otherItems: [
                    { name: 'Buckler' },
                    { name: 'Round Shield' },
                    { name: 'Koenig Shield' },
                ],
            },
            {
                fromItemId: 15068, toItemId: 15069,
                currencies: [cost(SILVER_100, 20), cost(BYNE_100, 20), cost(JADE_100, 20)],
                otherItems: [
                    { name: 'Attestation of Invulnerability', note: 'Key item from Dynamis' },
                ],
            },
            {
                fromItemId: 15069, toItemId: 15070,
                currencies: [cost(GOLD_10K, 1)],
                otherItems: [
                    { name: 'Supernal Fragment' },
                    { name: 'Necropsyche' },
                ],
            },
        ],
    },
]

export const RELIC_PROGRESSION_BY_BASENAME: Record<string, RelicProgression> =
    Object.fromEntries(RELIC_PROGRESSIONS.map(r => [r.baseName, r]))

// All 80 stage item IDs (excluding currency) — used to scan inventory for
// "what stage of which relic do I currently hold?"
export const ALL_STAGE_ITEM_IDS = new Set(
    RELIC_PROGRESSIONS.flatMap(r => r.stages)
)

// Lookup: stage item ID -> { baseName, stageIndex (0..4) }
export const STAGE_BY_ITEM_ID = new Map<number, { baseName: string; stageIndex: number }>(
    RELIC_PROGRESSIONS.flatMap(r =>
        r.stages.map((id, idx) => [id, { baseName: r.baseName, stageIndex: idx }] as const)
    )
)

// Sum of all currency costs across a relic's full chain, normalized to
// tier-1-equivalents per nation. Used for the "unstarted" empty-state to
// show total path cost.
export interface NationCost {
    Bastok: number
    "San d'Oria": number
    Windurst: number
}

export function totalChainCost(relic: RelicProgression): NationCost {
    const total: NationCost = { Bastok: 0, "San d'Oria": 0, Windurst: 0 }
    for (const t of relic.transitions) {
        for (const c of t.currencies) {
            const currency = CURRENCY_BY_ID[c.currencyItemId]
            if (!currency) continue
            total[currency.nation] += currency.tier * c.amount
        }
    }
    return total
}
