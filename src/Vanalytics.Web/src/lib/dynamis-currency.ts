// Dynamis currency catalog.
//
// Nine currencies across three nations (Bastok / San d'Oria / Windurst) and
// three tiers (1x / 100x / 10,000x). Currencies are used to upgrade Relic
// Weapons through their Dynamis-era stages (Relic drop -> Lv.75 base).
//
// Item IDs sourced from Windower's Resources/items.lua. In-game names use
// abbreviated forms (e.g. "M. Silverpiece") -- see CURRENCIES[].fullName for
// the BG-Wiki canonical name.
//
// Source: https://www.bg-wiki.com/ffxi/Category:Dynamis_Currency

export type CurrencyNation = 'Bastok' | "San d'Oria" | 'Windurst'
export type CurrencyTier = 1 | 100 | 10000

export interface DynamisCurrency {
    itemId: number
    name: string          // in-game display name, e.g. "M. Silverpiece"
    fullName: string      // canonical BG-Wiki name, e.g. "Montiont Silverpiece"
    nation: CurrencyNation
    tier: CurrencyTier
}

export const CURRENCIES: DynamisCurrency[] = [
    // Bastok
    { itemId: 1455, name: '1 Byne Bill',       fullName: 'One Byne Bill',           nation: 'Bastok',     tier: 1     },
    { itemId: 1456, name: '100 Byne Bill',     fullName: 'One Hundred Byne Bill',   nation: 'Bastok',     tier: 100   },
    { itemId: 1457, name: '10,000 Byne Bill',  fullName: 'Ten Thousand Byne Bill',  nation: 'Bastok',     tier: 10000 },
    // San d'Oria
    { itemId: 1452, name: 'O. Bronzepiece',    fullName: 'Ordelle Bronzepiece',     nation: "San d'Oria", tier: 1     },
    { itemId: 1453, name: 'M. Silverpiece',    fullName: 'Montiont Silverpiece',    nation: "San d'Oria", tier: 100   },
    { itemId: 1454, name: 'R. Goldpiece',      fullName: 'Ranperre Goldpiece',      nation: "San d'Oria", tier: 10000 },
    // Windurst
    { itemId: 1449, name: 'T. Whiteshell',     fullName: 'Tukuku Whiteshell',       nation: 'Windurst',   tier: 1     },
    { itemId: 1450, name: 'L. Jadeshell',      fullName: 'Lungo-Nango Jadeshell',   nation: 'Windurst',   tier: 100   },
    { itemId: 1451, name: 'R. Stripeshell',    fullName: 'Rimilala Stripeshell',    nation: 'Windurst',   tier: 10000 },
]

export const CURRENCY_BY_ID: Record<number, DynamisCurrency> = Object.fromEntries(
    CURRENCIES.map(c => [c.itemId, c])
)

export const CURRENCY_ITEM_IDS = new Set(CURRENCIES.map(c => c.itemId))

// Convert a held quantity of any currency into tier-1 equivalents.
// E.g. 3 × 100 Byne Bill = 300 byne-equivalents.
export function toTierOneEquivalents(currency: DynamisCurrency, quantity: number): number {
    return currency.tier * quantity
}

// Given a per-currency-item count map, return total tier-1 equivalents the
// player holds across all tiers of the target currency's nation. Used to
// answer "do I have enough currency to afford this stage?" by comparing
// against the cost normalized to tier-1.
//
// The currency-exchange NPC trades 100 singles <-> 1 hundred-stack within a
// nation, so for purchasing-power purposes all three tiers are fungible at
// the documented multiplier rates.
export function availableForCurrency(
    target: DynamisCurrency,
    countsByItemId: Map<number, number>,
): number {
    let total = 0
    for (const c of CURRENCIES) {
        if (c.nation !== target.nation) continue
        const held = countsByItemId.get(c.itemId) ?? 0
        total += toTierOneEquivalents(c, held)
    }
    return total
}
