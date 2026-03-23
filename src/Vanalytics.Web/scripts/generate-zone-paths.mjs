/**
 * Generates zone-paths.json with FFXI zone geometry DAT paths.
 *
 * Zone geometry DATs contain MZB (0x1C) and MMB (0x2E) blocks.
 * Paths sourced from Codecomp's FFXI zone DAT file locations gist
 * and NavMesh Builder TopazNames.cs zone ID list.
 *
 * The gist format is "volume-folder-file" where:
 *   volume 1 = ROM/, volume 2 = ROM2/, etc.
 *   Path = ROM{n}/{folder}/{file}.dat
 *
 * Run: node scripts/generate-zone-paths.mjs
 * Output: public/data/zone-paths.json
 */

// Zone geometry paths from Codecomp gist (volume-folder-file format)
// Coordinates are camera start positions (not used here)
const ZONE_DATA = [
  // ═══════ Original Areas (from gist: 1-0-* and 1-1-*) ═══════
  { name: 'Qufim Island', path: 'ROM/0/58.dat', expansion: 'Original' },
  { name: 'Beadeaux', path: 'ROM/0/61.dat', expansion: 'Original' },
  { name: 'Qulun Dome', path: 'ROM/0/62.dat', expansion: 'Original' },
  { name: 'Castle Oztroja', path: 'ROM/0/63.dat', expansion: 'Original' },
  { name: 'Altar Room', path: 'ROM/0/64.dat', expansion: 'Original' },
  { name: 'Toraimarai Canal', path: 'ROM/0/65.dat', expansion: 'Original' },
  { name: 'Castle Zvahl Keep', path: 'ROM/0/73.dat', expansion: 'Original' },
  { name: 'Throne Room', path: 'ROM/0/74.dat', expansion: 'Original' },
  { name: 'Maze of Shakhrami', path: 'ROM/0/75.dat', expansion: 'Original' },
  { name: "Crawler's Nest", path: 'ROM/0/76.dat', expansion: 'Original' },
  { name: 'The Eldieme Necropolis', path: 'ROM/0/77.dat', expansion: 'Original' },
  { name: 'Windurst Waters', path: 'ROM/0/78.dat', expansion: 'Original' },
  { name: 'Windurst Walls', path: 'ROM/0/79.dat', expansion: 'Original' },
  { name: 'Port Windurst', path: 'ROM/0/80.dat', expansion: 'Original' },
  { name: 'Windurst Woods', path: 'ROM/0/81.dat', expansion: 'Original' },
  { name: 'Palborough Mines', path: 'ROM/0/88.dat', expansion: 'Original' },
  { name: "Ordelle's Caves", path: 'ROM/0/92.dat', expansion: 'Original' },
  { name: 'Ghelsba Outpost', path: 'ROM/0/95.dat', expansion: 'Original' },
  { name: 'Davoi', path: 'ROM/0/99.dat', expansion: 'Original' },
  { name: 'Monastic Cavern', path: 'ROM/0/100.dat', expansion: 'Original' },
  { name: 'Valkurm Dunes', path: 'ROM/0/102.dat', expansion: 'Original' },
  { name: 'Giddeus', path: 'ROM/0/104.dat', expansion: 'Original' },
  { name: 'Bostaunieux Oubliette', path: 'ROM/0/108.dat', expansion: 'Original' },
  { name: 'Inner Horutoto Ruins', path: 'ROM/0/112.dat', expansion: 'Original' },
  { name: "Port San d'Oria", path: 'ROM/0/113.dat', expansion: 'Original' },
  { name: 'West Ronfaure', path: 'ROM/0/120.dat', expansion: 'Original' },
  { name: 'East Ronfaure', path: 'ROM/0/121.dat', expansion: 'Original' },
  { name: 'North Gustaberg', path: 'ROM/0/123.dat', expansion: 'Original' },
  { name: 'South Gustaberg', path: 'ROM/0/124.dat', expansion: 'Original' },
  { name: 'West Sarutabaruta', path: 'ROM/0/127.dat', expansion: 'Original' },
  { name: 'East Sarutabaruta', path: 'ROM/1/0.dat', expansion: 'Original' },
  { name: 'Fort Ghelsba', path: 'ROM/1/7.dat', expansion: 'Original' },
  { name: 'Zeruhn Mines', path: 'ROM/1/11.dat', expansion: 'Original' },
  { name: 'Gusgen Mines', path: 'ROM/1/16.dat', expansion: 'Original' },
  { name: 'Garlaige Citadel', path: 'ROM/1/17.dat', expansion: 'Original' },
  { name: "Southern San d'Oria", path: 'ROM/1/31.dat', expansion: 'Original' },
  { name: "Northern San d'Oria", path: 'ROM/1/32.dat', expansion: 'Original' },
  { name: "Chateau d'Oraguille", path: 'ROM/1/33.dat', expansion: 'Original' },
  { name: 'Bastok Mines', path: 'ROM/1/34.dat', expansion: 'Original' },
  { name: 'Bastok Markets', path: 'ROM/1/35.dat', expansion: 'Original' },
  { name: 'Port Bastok', path: 'ROM/1/36.dat', expansion: 'Original' },
  { name: 'Metalworks', path: 'ROM/1/37.dat', expansion: 'Original' },
  { name: "Ru'Lude Gardens", path: 'ROM/1/39.dat', expansion: 'Original' },
  { name: 'Upper Jeuno', path: 'ROM/1/40.dat', expansion: 'Original' },
  { name: 'Lower Jeuno', path: 'ROM/1/41.dat', expansion: 'Original' },
  { name: 'Port Jeuno', path: 'ROM/1/42.dat', expansion: 'Original' },
  { name: 'Selbina', path: 'ROM/1/43.dat', expansion: 'Original' },
  { name: 'Mhaura', path: 'ROM/1/44.dat', expansion: 'Original' },

  // ═══════ Zones we can infer from FFXI zone IDs + VTABLE patterns ═══════
  // Additional original zones (following the ROM/0/ and ROM/1/ pattern)
  { name: 'La Theine Plateau', path: 'ROM/0/122.dat', expansion: 'Original' },
  { name: 'Jugner Forest', path: 'ROM/0/101.dat', expansion: 'Original' },
  { name: 'Batallia Downs', path: 'ROM/0/103.dat', expansion: 'Original' },
  { name: 'Konschtat Highlands', path: 'ROM/0/106.dat', expansion: 'Original' },
  { name: 'Pashhow Marshlands', path: 'ROM/0/107.dat', expansion: 'Original' },
  { name: 'Rolanberry Fields', path: 'ROM/0/109.dat', expansion: 'Original' },
  { name: 'Beaucedine Glacier', path: 'ROM/0/110.dat', expansion: 'Original' },
  { name: 'Xarcabard', path: 'ROM/0/111.dat', expansion: 'Original' },
  { name: 'Tahrongi Canyon', path: 'ROM/0/114.dat', expansion: 'Original' },
  { name: 'Buburimu Peninsula', path: 'ROM/0/115.dat', expansion: 'Original' },
  { name: 'Meriphataud Mountains', path: 'ROM/0/116.dat', expansion: 'Original' },
  { name: 'Sauromugue Champaign', path: 'ROM/0/117.dat', expansion: 'Original' },
  { name: "Behemoth's Dominion", path: 'ROM/0/126.dat', expansion: 'Original' },
  { name: 'Ranguemont Pass', path: 'ROM/0/118.dat', expansion: 'Original' },
  { name: "Fei'Yin", path: 'ROM/0/119.dat', expansion: 'Original' },
  { name: "King Ranperre's Tomb", path: 'ROM/0/89.dat', expansion: 'Original' },
  { name: 'Dangruf Wadi', path: 'ROM/0/90.dat', expansion: 'Original' },
  { name: 'Korroloka Tunnel', path: 'ROM/1/9.dat', expansion: 'Original' },
  { name: 'Kuftal Tunnel', path: 'ROM/1/10.dat', expansion: 'Original' },
  { name: 'Castle Zvahl Baileys', path: 'ROM/0/66.dat', expansion: 'Original' },
  { name: 'Yughott Grotto', path: 'ROM/0/96.dat', expansion: 'Original' },
]

// Expansion sort order
const EXPANSION_ORDER = ['Original', 'Zilart', 'Promathia', 'Aht Urhgan', 'Wings of the Goddess', 'Seekers of Adoulin']

// Sort by expansion order, then by name
ZONE_DATA.sort((a, b) => {
  const ea = EXPANSION_ORDER.indexOf(a.expansion)
  const eb = EXPANSION_ORDER.indexOf(b.expansion)
  if (ea !== eb) return ea - eb
  return a.name.localeCompare(b.name)
})

console.log(`Total: ${ZONE_DATA.length} zone geometry entries`)
for (const exp of EXPANSION_ORDER) {
  const count = ZONE_DATA.filter(z => z.expansion === exp).length
  if (count > 0) console.log(`  ${exp}: ${count}`)
}

const fs = await import('fs')
const outPath = new URL('../public/data/zone-paths.json', import.meta.url).pathname
const cleanPath = outPath.replace(/^\/([A-Z]:)/, '$1')
fs.writeFileSync(cleanPath, JSON.stringify(ZONE_DATA, null, 2))
console.log(`Wrote ${cleanPath}`)
