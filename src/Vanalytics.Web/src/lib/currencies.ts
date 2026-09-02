// Player currency catalog. Values are captured by the addon from FFXI packets
// 0x113 (Currencies I) and 0x118 (Currencies II) and synced as a flat
// { key: value } map. This module supplies display metadata (name, category,
// cap) keyed by the same `key` strings the addon emits. Caps are static
// game-design constants verified against BG-Wiki; null means uncapped/unknown.

export type CurrencyCategory =
    | 'nation'
    | 'seals'
    | 'battle'
    | 'zone'
    | 'dynamis'
    | 'records'
    | 'crafting'
    | 'other'

export const CURRENCY_CATEGORY_LABELS: Record<CurrencyCategory, string> = {
    nation: 'Nation & Conquest',
    seals: 'Seals & Crests',
    battle: 'Battle Content',
    zone: 'Zone Currencies',
    dynamis: 'Dynamis & Domain',
    records: 'Records of Eminence & Login',
    crafting: 'Crafting',
    other: 'Other',
}

export interface CurrencyEntry {
    key: string
    name: string
    category: CurrencyCategory
    cap: number | null
}

// Catalog order is category-grouped, preserving Master Currency Table order
// within each category. Caps verified against BG-Wiki (bg-wiki.com); see
// inline notes for entries with conditional/expandable caps or where no
// holding cap is documented (cap: null). Verified 2026-09.
export const CURRENCIES: CurrencyEntry[] = [
    // --- nation ---
    { key: 'conquestSandoria', name: "Conquest Points (San d'Oria)", category: 'nation', cap: null },
    { key: 'conquestBastok', name: 'Conquest Points (Bastok)', category: 'nation', cap: null },
    { key: 'conquestWindurst', name: 'Conquest Points (Windurst)', category: 'nation', cap: null },
    // BG-Wiki (Category:Chocobo Racing): "The maximum amount of Chocobucks a
    // player can hold at one time is 1000." Per-nation balances, same cap each.
    { key: 'chocobucksSandoria', name: "Chocobucks (San d'Oria)", category: 'nation', cap: 1000 },
    { key: 'chocobucksBastok', name: 'Chocobucks (Bastok)', category: 'nation', cap: 1000 },
    { key: 'chocobucksWindurst', name: 'Chocobucks (Windurst)', category: 'nation', cap: 1000 },
    { key: 'imperialStanding', name: 'Imperial Standing', category: 'nation', cap: null },
    { key: 'alliedNotes', name: 'Allied Notes', category: 'nation', cap: null },
    { key: 'dominionNotes', name: 'Dominion Notes', category: 'nation', cap: null },
    // BG-Wiki: hold 1 at a time; Rytaal stores up to 3 more (4 total), or 4
    // more (5 total) with Captain rank. Using the max achievable value.
    { key: 'imperialArmyIdTags', name: 'Imperial Army ID Tags', category: 'nation', cap: 5 },
    { key: 'imperialStandingAccolades', name: 'Imperial Standing Accolades', category: 'nation', cap: null },

    // --- seals ---
    // BG-Wiki: Shami (Beastmen's/Kindred's Seals) and Sagheera (Ancient
    // Beastcoin) "may be traded any number...at any time and he will store
    // them" -- no documented holding cap for any of these six.
    { key: 'beastmanSeals', name: 'Beastman Seals', category: 'seals', cap: null },
    { key: 'kindredSeals', name: 'Kindred Seals', category: 'seals', cap: null },
    { key: 'kindredCrests', name: 'Kindred Crests', category: 'seals', cap: null },
    { key: 'highKindredCrests', name: 'High Kindred Crests', category: 'seals', cap: null },
    { key: 'sacredKindredCrests', name: 'Sacred Kindred Crests', category: 'seals', cap: null },
    { key: 'ancientBeastcoins', name: 'Ancient Beastcoins', category: 'seals', cap: null },

    // --- battle ---
    // BG-Wiki (Valor Points): "Up to 50,000 tabs can be carried."
    { key: 'valorPoints', name: 'Valor Points', category: 'battle', cap: 50000 },
    // No BG-Wiki article corroborates a "Cinders" currency distinct from
    // Riftcinder (a stackable item). Field exists in fields.lua at 0x113/0x44
    // per XiPackets cross-verification, but its in-game identity/cap could
    // not be confirmed. Flagged for spot-check.
    { key: 'cinders', name: 'Cinders', category: 'battle', cap: null },
    // BG-Wiki (Category:Ballista): "Ballista Points are awarded after each
    // match, up to a maximum of 2000."
    { key: 'ballistaPoints', name: 'Ballista Points', category: 'battle', cap: 2000 },
    { key: 'legionPoints', name: 'Legion Points', category: 'battle', cap: null },
    { key: 'assaultLeujaoam', name: 'Assault Points (Leujaoam Sanctum)', category: 'battle', cap: null },
    { key: 'assaultMamook', name: 'Assault Points (M.J.T.G.)', category: 'battle', cap: null },
    { key: 'assaultLebros', name: 'Assault Points (Lebros Cavern)', category: 'battle', cap: null },
    { key: 'assaultPeriqia', name: 'Assault Points (Periqia)', category: 'battle', cap: null },
    { key: 'assaultIlrusi', name: 'Assault Points (Ilrusi Atoll)', category: 'battle', cap: null },
    { key: 'nyzulTokens', name: 'Nyzul Tokens', category: 'battle', cap: null },
    // BG-Wiki (Zeni NM System): "The maximum amount of zeni that may be held
    // at a time is 1 million."
    { key: 'zeni', name: 'Zeni', category: 'battle', cap: 1000000 },
    // BG-Wiki (Category:Pankration): Jetton rewards have "no known cap and
    // will continue to climb."
    { key: 'jettons', name: 'Jettons', category: 'battle', cap: null },
    { key: 'resistanceCredits', name: 'Resistance Credits', category: 'battle', cap: null },
    // BG-Wiki (Waypoint#Kinetic_Units): "The maximum number of Kinetic Units
    // that may be accumulated is 50,000 (anything past that will be lost)."
    { key: 'kineticUnits', name: 'Kinetic Units', category: 'battle', cap: 50000 },
    // BG-Wiki (Category:Skirmish#Obsidian_Fragments): "can be accumulated up
    // to 99,999."
    { key: 'obsidianFragments', name: 'Obsidian Fragments', category: 'battle', cap: 99999 },
    { key: 'hallmarks', name: 'Hallmarks', category: 'battle', cap: null },
    { key: 'totalHallmarks', name: 'Total Hallmarks', category: 'battle', cap: null },
    { key: 'badgesOfGallantry', name: 'Badges of Gallantry', category: 'battle', cap: null },
    // BG-Wiki (Gallimaufry): base holding cap 100,000, raised to 100,000,000
    // only after completing The Voracious Resurgence. cap:null (rather than
    // either value) — a max-achievable cap makes near-cap never fire for
    // base-tier players; base cap varies by progression. Revisit if a
    // per-player cap is ever modeled.
    { key: 'gallimaufry', name: 'Gallimaufry', category: 'battle', cap: null },
    // BG-Wiki (Temenos/Apollyon Furnace): max is 100,000 of each, including
    // amounts added via treasure chests.
    { key: 'temenosUnits', name: 'Temenos Units', category: 'battle', cap: 100000 },
    { key: 'apollyonUnits', name: 'Apollyon Units', category: 'battle', cap: 100000 },

    // --- zone ---
    { key: 'scylds', name: 'Scylds', category: 'zone', cap: null },
    { key: 'therionIchor', name: 'Therion Ichor', category: 'zone', cap: null },
    { key: 'cruor', name: 'Cruor', category: 'zone', cap: null },
    // BG-Wiki (Voidstone): 3 initially, +1 each from three periapts, up to 6.
    { key: 'voidstones', name: 'Voidstones', category: 'zone', cap: 6 },
    // BG-Wiki (A.M.A.N. Reclaimer): every 1,000 Reclamation Marks auto-
    // converts to 1x Copper A.M.A.N. Voucher -- functions as a 1,000 ceiling.
    { key: 'reclamationMarks', name: 'Reclamation Marks', category: 'zone', cap: 1000 },
    { key: 'bayld', name: 'Bayld', category: 'zone', cap: null },
    { key: 'mweyaPlasmCorpuscles', name: 'Mweya Plasm Corpuscles', category: 'zone', cap: null },
    // BG-Wiki (Category:Escha#Currencies): 5,000 base, up to 50,000 with all
    // three Eschan key items (urn/cellar/nef). Using the max achievable.
    { key: 'eschaBeads', name: 'Escha Beads', category: 'zone', cap: 50000 },
    // BG-Wiki (Category:Escha#Currencies): base holding cap 100,000, up to
    // 1,000,000,000 with all three Eschan key items. cap:null for the same
    // reason as Gallimaufry — a max-achievable cap makes near-cap never fire
    // for base-tier players.
    { key: 'eschaSilt', name: 'Escha Silt', category: 'zone', cap: null },

    // --- crafting ---
    // BG-Wiki (Guild Points): documents daily earning limits (1,000-8,000)
    // but no overall holding cap for any of the nine crafts.
    { key: 'guildFishing', name: 'Guild Points (Fishing)', category: 'crafting', cap: null },
    { key: 'guildWoodworking', name: 'Guild Points (Woodworking)', category: 'crafting', cap: null },
    { key: 'guildSmithing', name: 'Guild Points (Smithing)', category: 'crafting', cap: null },
    { key: 'guildGoldsmithing', name: 'Guild Points (Goldsmithing)', category: 'crafting', cap: null },
    { key: 'guildWeaving', name: 'Guild Points (Weaving)', category: 'crafting', cap: null },
    { key: 'guildLeathercraft', name: 'Guild Points (Leathercraft)', category: 'crafting', cap: null },
    { key: 'guildBonecraft', name: 'Guild Points (Bonecraft)', category: 'crafting', cap: null },
    { key: 'guildAlchemy', name: 'Guild Points (Alchemy)', category: 'crafting', cap: null },
    { key: 'guildCooking', name: 'Guild Points (Cooking)', category: 'crafting', cap: null },
    // BG-Wiki (Category:Escutcheons#CrafterPoints): "The maximum number of
    // points you may possess is 50,000."
    { key: 'crafterPoints', name: 'Crafter Points', category: 'crafting', cap: 50000 },

    // --- dynamis ---
    // BG-Wiki (Op Credit): "Players can hold one at a time and they can be
    // stored by NPCs up to seven." Using the max bankable value.
    { key: 'opCredits', name: 'Op Credits', category: 'dynamis', cap: 7 },
    // BG-Wiki (Traverser stone): 3 base, +1 per Abyssite of Avarice, up to 6.
    { key: 'traverserStones', name: 'Traverser Stones', category: 'dynamis', cap: 6 },
    { key: 'domainPoints', name: 'Domain Points', category: 'dynamis', cap: null },
    // BG-Wiki (Domain Invasion): up to 80 Domain Points/day normally, raised
    // to 100/day server-wide once Mireu has been defeated 5+ times.
    { key: 'domainPointsToday', name: 'Domain Points Earned Today', category: 'dynamis', cap: 100 },

    // --- records ---
    // INFERRED, not directly confirmed: BG-Wiki's Sparks_of_Eminence /
    // Records_of_Eminence pages document only the 100,000/week *exchange*
    // limit, not a holding cap. The sibling currency Unity Accolades — which
    // shares that same weekly exchange limit — has a BG-Wiki-confirmed holding
    // cap of 99,999, so we infer the same for Sparks by design symmetry.
    { key: 'sparksOfEminence', name: 'Sparks of Eminence', category: 'records', cap: 99999 },
    { key: 'shiningStars', name: 'Shining Stars', category: 'records', cap: null },
    { key: 'amanVouchers', name: 'A.M.A.N. Vouchers', category: 'records', cap: null },
    // BG-Wiki (Repeat Login Campaign): "Up to 700 points may be carried
    // forward from one month to another...anything over 700 is lost."
    { key: 'loginPoints', name: 'Login Points', category: 'records', cap: 700 },
    // BG-Wiki (Category:Unity_Concord#Unity_Accolades): "Accolades cap at
    // 99,999."
    { key: 'unityAccolades', name: 'Unity Accolades', category: 'records', cap: 99999 },
    { key: 'deeds', name: 'Deeds', category: 'records', cap: null },
    { key: 'silverAmanVouchers', name: 'Silver A.M.A.N. Vouchers', category: 'records', cap: null },

    // --- other ---
    // BG-Wiki (Fellow Points): "The capped amount of Fellow Points is
    // 9999999."
    { key: 'fellowPoints', name: 'Fellow Points', category: 'other', cap: 9999999 },
    // BG-Wiki (Gobbie Mystery Box): "There is a hard limit of 50,000 points."
    { key: 'dailyTally', name: 'Daily Tally', category: 'other', cap: 50000 },
    { key: 'researchMarks', name: 'Research Marks', category: 'other', cap: null },
    { key: 'moblinMarbles', name: 'Moblin Marbles', category: 'other', cap: null },
    // BG-Wiki (Category:Monstrosity#Infamy): caps at 10,000 normally, up to
    // 50,000 while Belligerency is active. Using the max achievable.
    { key: 'infamy', name: 'Infamy', category: 'other', cap: 50000 },
    { key: 'prestige', name: 'Prestige', category: 'other', cap: null },
    // BG-Wiki (Cave Conservation Points): "Max: 6".
    { key: 'caveConservationPoints', name: 'Cave Conservation Points', category: 'other', cap: 6 },
    // BG-Wiki (Kupofried's corundum): "You can hold up to three...at once."
    { key: 'kupofriedsCorundums', name: "Kupofried's Corundums", category: 'other', cap: 3 },
    // BG-Wiki (Imprimatur): 15 base, up to 18 with Bronze + Silver mattock
    // cordon key items. Using the max achievable.
    { key: 'coalitionImprimaturs', name: 'Coalition Imprimaturs', category: 'other', cap: 18 },
    // Community/forum sources describe Incantrix storing up to 3 Mystical
    // Canteens (increased from 2); no BG-Wiki article confirmed directly.
    { key: 'mysticalCanteens', name: 'Mystical Canteens', category: 'other', cap: 3 },
    { key: 'potpourri', name: 'Potpourri', category: 'other', cap: null },
    { key: 'mogSegments', name: 'Mog Segments', category: 'other', cap: null },
]

export interface CurrencyListEntry {
    entry: CurrencyEntry
    value: number
    pctOfCap: number | null
}

// Fallback for a synced key with no catalog entry (catalog drift): show the raw
// key, category 'other', no cap — mirrors warps.ts lookupWarp's "#N" fallback.
export function lookupCurrency(key: string): CurrencyEntry {
    const found = CURRENCIES.find(c => c.key === key)
    if (found) return found
    return { key, name: key, category: 'other', cap: null }
}

// Merge the catalog with a synced { key: value } map into ordered rows.
// Catalog entries come first (catalog order); any synced key not in the catalog
// is appended via lookupCurrency so no captured data is hidden. Missing values
// default to 0. pctOfCap is null when the entry is uncapped.
export function listCurrencies(values: Record<string, number>): CurrencyListEntry[] {
    const rows: CurrencyListEntry[] = CURRENCIES.map(entry => {
        const value = values[entry.key] ?? 0
        const pctOfCap = entry.cap != null && entry.cap > 0
            ? (value / entry.cap) * 100
            : null
        return { entry, value, pctOfCap }
    })

    const catalogKeys = new Set(CURRENCIES.map(c => c.key))
    for (const key of Object.keys(values)) {
        if (!catalogKeys.has(key)) {
            rows.push({ entry: lookupCurrency(key), value: values[key], pctOfCap: null })
        }
    }
    return rows
}
