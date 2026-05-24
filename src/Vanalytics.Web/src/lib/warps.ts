// Warp / teleport destination catalogs.
//
// The addon decodes packet 0x063 Order 0x06 bitmasks into bit-index IDs,
// one ID per unlocked destination. The mapping from bit-index → destination
// name is *not* documented in atom0s/XiPackets; it has to be reverse-
// engineered by triggering the packet in-game and matching arrived IDs
// against destinations the player is known to have unlocked.
//
// Until that catalog is populated, the UI falls back to displaying the
// raw ID (e.g. "Home Point #42"). Add entries here as they're confirmed.
//
// Source of truth when adding entries: BG-Wiki destination lists +
// in-game verification of which bit flips when each is unlocked.

export interface WarpEntry {
    id: number
    name: string
    region?: string
}

export type WarpCategory =
    | 'homePoints'
    | 'survivalGuides'
    | 'waypoints'
    | 'telepoints'
    | 'atmas'
    | 'eschanPortals'

export const WARP_CATEGORY_LABELS: Record<WarpCategory, string> = {
    homePoints: 'Home Points',
    survivalGuides: 'Survival Guides',
    waypoints: 'Waypoints',
    telepoints: 'Telepoints',
    atmas: 'Atmas',
    eschanPortals: 'Eschan Portals',
}

// Each category covers a documented number of bits per the XiPackets layout
// for Order 0x06 (e.g. home_point[4] = 128 bits = up to 128 destinations).
// Used by the UI for the "X unlocked / Y possible" progress label.
export const WARP_CATEGORY_CAPACITY: Record<WarpCategory, number> = {
    homePoints: 128,
    survivalGuides: 128,
    waypoints: 128,
    telepoints: 32,
    atmas: 32,
    eschanPortals: 32,
}

// Empty catalogs — populate as IDs are confirmed in-game. Keep entries
// ordered by ID so the UI renders a stable, expansion-grouped list.
export const HOME_POINTS: WarpEntry[] = []
export const SURVIVAL_GUIDES: WarpEntry[] = []
export const WAYPOINTS: WarpEntry[] = []
export const TELEPOINTS: WarpEntry[] = []
export const ATMAS: WarpEntry[] = []
export const ESCHAN_PORTALS: WarpEntry[] = []

const CATALOG: Record<WarpCategory, WarpEntry[]> = {
    homePoints: HOME_POINTS,
    survivalGuides: SURVIVAL_GUIDES,
    waypoints: WAYPOINTS,
    telepoints: TELEPOINTS,
    atmas: ATMAS,
    eschanPortals: ESCHAN_PORTALS,
}

export function lookupWarp(category: WarpCategory, id: number): WarpEntry {
    const found = CATALOG[category].find(e => e.id === id)
    if (found) return found
    return { id, name: `${WARP_CATEGORY_LABELS[category].replace(/s$/, '')} #${id}` }
}
