/**
 * Builds zone-seed-data.csv by enriching ZoneDats.csv with map DAT paths
 * sourced from xurion's ZONES.md (ffxi-map-dats repo).
 *
 * Matching strategy:
 *  1. Exact match (case-insensitive, apostrophe-normalized)
 *  2. Xurion name contained in CSV name (handles "Delkfutt's Tower" -> "Lower/Middle/Upper Delkfutt's Tower")
 *  3. CSV name contained in xurion name (reverse substring)
 *  4. Typo/variant aliases defined in ALIASES map
 *
 * Run: node scripts/build-zone-seed-csv.mjs
 * Output: public/data/zone-seed-data.csv
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../../')
const CSV_IN = path.join(REPO_ROOT, 'ZoneDats.csv')
const CSV_OUT = path.join(__dirname, '../public/data/zone-seed-data.csv')
const ZONES_URL = 'https://raw.githubusercontent.com/xurion/ffxi-map-dats/refs/heads/master/ZONES.md'

// Known typo/name-variant aliases in the xurion data -> canonical CSV name fragment
// Key: normalized xurion name, Value: normalized CSV zone name (or fragment that appears in it)
const ALIASES = {
  // Batillia / Batallia
  'batillia downs': 'batallia downs',
  // Gustaburg / Gustaberg
  'north gustaburg': 'north gustaberg',
  'south gustaburg': 'south gustaberg',
  // Pashow / Pashhow
  'pashow marshlands': 'pashhow marshlands',
  'pashow mashlands': 'pashhow marshlands',
  // Al'Zahbi / Al Zahbi
  "al'zahbi": 'al zahbi',
  // Carpenter's / Carpenters'
  "carpenter's landing": "carpenters' landing",
  // Crawler's Nest / Crawlers' Nest
  "crawler's nest": "crawlers' nest",
  // Diorama / Abdhaljs spacing
  'diorama abdhaljs - ghelsba': 'diorama abdhaljs-ghelsba',
  'abdhaljs isle - purgonorgo': 'abdhaljs isle-purgonorgo',
  // Chocobo Circuit typo ("Chcocbo")
  'chcocbo circuit': 'chocobo circuit',
  // Ve' Lugannon Palace (space after apostrophe)
  "ve' lugannon palace": 'velugannon palace',
  // The Shrine of Ru' Avitau (space after apostrophe)
  "the shrine of ru' avitau": "the shrine of ru'avitau",
  // Davio - La Vaule -> La Vaule [S]
  'davio - la vaule': 'la vaule',
  // Fort Karugo-Narugo
  'fort karugo-narugo': 'fort karugo-narugo [s]',
  // Grauberg [S] (xurion has "Grauberg" without [S])
  'grauberg': 'grauberg [s]',
}

// Normalize a zone name for comparison:
// - lowercase
// - collapse all apostrophe variants (', ', ') to a single '
// - trim whitespace
function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[\u2018\u2019\u0060\u00B4]/g, "'")  // curly/smart apostrophes
    .replace(/\s+/g, ' ')
    .trim()
}

// Strip trailing " (S)?" style suffixes for base-name matching,
// also strip trailing " (U)", numbers like " 1", " 2", " 3", etc.
function stripSuffix(name) {
  return name
    .replace(/\s*\(S\)\??\s*$/i, '')
    .replace(/\s*\(U\)\s*$/i, '')
    .replace(/\s+\d+\s*$/i, '')
    .replace(/\s*\?\s*$/, '')
    .trim()
}

// ---- Step 1: Parse ZoneDats.csv ----
console.log(`Reading ${CSV_IN}`)
let csvText = fs.readFileSync(CSV_IN, 'utf8')
// Strip BOM if present
if (csvText.charCodeAt(0) === 0xFEFF) csvText = csvText.slice(1)
const csvLines = csvText.split('\n').map(l => l.trimEnd())

// Header: ID,NAME,MODEL,DIALOG,NPCs,EVENTS
// We preserve all original columns and append MAP_PATHS
const header = csvLines[0]
const dataLines = csvLines.slice(1).filter(l => l.trim() !== '')

// Parse CSV rows (no quoted fields in source data, commas separate cols)
function parseCsvRow(line) {
  // Simple split — source CSV has no quoted fields
  return line.split(',')
}

const rows = dataLines.map(line => parseCsvRow(line))

// ---- Step 2: Fetch and parse ZONES.md ----
console.log(`Fetching ${ZONES_URL}`)
const resp = await fetch(ZONES_URL)
if (!resp.ok) throw new Error(`Failed to fetch ZONES.md: ${resp.status} ${resp.statusText}`)
const mdText = await resp.text()

// Parse markdown table rows: | Zone Name | ROM/XX/XX.DAT | ... |
// xurionMap: Map<normalizedName, string[]> (array of DAT paths)
const xurionMap = new Map()

for (const line of mdText.split('\n')) {
  // Match table rows: | Zone Name | ROM/xx/xx.DAT | ...
  const match = line.match(/^\|\s*([^|]+?)\s*\|\s*(ROM[^|]+?\.DAT)\s*\|/)
  if (!match) continue

  const rawName = match[1].trim()
  const datPath = match[2].trim().toUpperCase()  // Normalize to uppercase DAT extension

  // Skip header separator rows
  if (rawName.startsWith('---') || rawName.startsWith('Zone')) continue

  // Normalize the xurion name, strip suffixes for base matching
  const normFull = normalize(rawName)
  const normBase = normalize(stripSuffix(rawName))

  // Apply alias if present
  const aliasedFull = ALIASES[normFull] ?? normFull
  const aliasedBase = ALIASES[normBase] ?? normBase

  // Add to map under full normalized name and base name
  for (const key of new Set([normFull, normBase, aliasedFull, aliasedBase])) {
    if (!key) continue
    if (!xurionMap.has(key)) xurionMap.set(key, [])
    const existing = xurionMap.get(key)
    if (!existing.includes(datPath)) existing.push(datPath)
  }
}

console.log(`Parsed ${xurionMap.size} unique xurion zone name keys`)

// ---- Step 3: Match each CSV zone to xurion map paths ----

// Build a list of all xurion keys for substring matching
const allXurionKeys = [...xurionMap.keys()]

function findMapPaths(csvName) {
  if (!csvName || csvName.trim() === '') return ''

  const normCsv = normalize(csvName)
  const normCsvBase = normalize(stripSuffix(csvName))

  // 1. Exact match on full normalized CSV name
  if (xurionMap.has(normCsv)) return xurionMap.get(normCsv).join(';')

  // 2. Exact match on base (stripped) CSV name
  if (normCsvBase !== normCsv && xurionMap.has(normCsvBase)) {
    return xurionMap.get(normCsvBase).join(';')
  }

  // 3. Check alias of csv name
  const aliasCsv = ALIASES[normCsv]
  if (aliasCsv && xurionMap.has(aliasCsv)) return xurionMap.get(aliasCsv).join(';')
  const aliasCsvBase = ALIASES[normCsvBase]
  if (aliasCsvBase && xurionMap.has(aliasCsvBase)) return xurionMap.get(aliasCsvBase).join(';')

  // 4. Collect all DATs from xurion entries whose key is contained in csvName
  //    (e.g., xurion "delkfutt's tower" is contained in "lower delkfutt's tower")
  const collectedPaths = []
  for (const xKey of allXurionKeys) {
    if (normCsv.includes(xKey) || normCsvBase.includes(xKey)) {
      for (const p of xurionMap.get(xKey)) {
        if (!collectedPaths.includes(p)) collectedPaths.push(p)
      }
    }
  }
  if (collectedPaths.length > 0) return collectedPaths.join(';')

  // 5. Check if any xurion key contains the CSV name (reverse substring)
  //    Only use if it's a reasonably long match (avoid false positives)
  if (normCsv.length >= 5) {
    for (const xKey of allXurionKeys) {
      if (xKey.includes(normCsv) || xKey.includes(normCsvBase)) {
        const paths = xurionMap.get(xKey)
        const unique = []
        for (const p of paths) if (!unique.includes(p)) unique.push(p)
        return unique.join(';')
      }
    }
  }

  return ''
}

// ---- Step 4: Build output rows ----
const unmatchedNames = []
const matchedNames = []

const outputLines = [header + ',MAP_PATHS']

for (const row of rows) {
  const id = row[0]
  const name = row[1] ?? ''
  const mapPaths = findMapPaths(name)

  if (name && name.trim() !== '' && !mapPaths) {
    unmatchedNames.push(`  ID ${id}: "${name}"`)
  } else if (mapPaths) {
    matchedNames.push(`  ID ${id}: "${name}" -> ${mapPaths.split(';').length} paths`)
  }

  outputLines.push(row.join(',') + ',' + mapPaths)
}

// ---- Step 5: Write output ----
const outDir = path.dirname(CSV_OUT)
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

fs.writeFileSync(CSV_OUT, outputLines.join('\n') + '\n', 'utf8')

// ---- Report ----
console.log(`\nWrote ${outputLines.length - 1} data rows to ${CSV_OUT}`)
console.log(`\nMatched zones (${matchedNames.length}):`)
for (const m of matchedNames) console.log(m)

console.log(`\nUnmatched zones (${unmatchedNames.length}):`)
for (const u of unmatchedNames) console.log(u)

// Spot-check West Ronfaure
const wrLine = outputLines.find(l => l.startsWith('100,West Ronfaure,'))
console.log(`\nSpot-check West Ronfaure (ID 100): ${wrLine ?? 'NOT FOUND'}`)

const mdt = outputLines.find(l => l.startsWith('157,Middle Delkfutt'))
console.log(`Spot-check Middle Delkfutt's Tower (ID 157): ${mdt ?? 'NOT FOUND'}`)
