/**
 * Fetches AltanaView PC animation CSV data and generates animation-paths.json.
 *
 * Sources: List/PC/{Race}/Action.csv — named animations (weapon skills, emotes, abilities)
 *          List/PC/{Race}/Motion.csv — base motion DATs (idle, walk, run, combat stances)
 *
 * Run:    node scripts/generate-animation-paths.mjs
 * Output: public/data/animation-paths.json
 */

const BASE = 'https://raw.githubusercontent.com/mynameisgonz/AltanaView/master/List/PC'

// Map AltanaView folder names to Windower race IDs
const RACES = [
  { folder: 'HumeM',   raceId: 1, label: 'Hume Male' },
  { folder: 'HumeF',   raceId: 2, label: 'Hume Female' },
  { folder: 'ElvaanM', raceId: 3, label: 'Elvaan Male' },
  { folder: 'ElvaanF', raceId: 4, label: 'Elvaan Female' },
  { folder: 'Tarutaru',raceId: 5, label: 'Tarutaru' },
  { folder: 'Mithra',  raceId: 7, label: 'Mithra' },
  { folder: 'Galka',   raceId: 8, label: 'Galka' },
]

/**
 * Expand a path segment like "32/13-21" into individual ROM paths.
 * AltanaView PC paths are always ROM volume 1 (no volume prefix).
 */
function expandSegment(segment) {
  const trimmed = segment.trim()
  if (!trimmed) return []

  const slash = trimmed.indexOf('/')
  if (slash < 0) return []

  const folder = trimmed.slice(0, slash)
  const fileSpec = trimmed.slice(slash + 1)

  if (fileSpec.includes('-')) {
    const [startStr, endStr] = fileSpec.split('-')
    const start = parseInt(startStr, 10)
    const end = parseInt(endStr, 10)
    if (isNaN(start) || isNaN(end)) return []
    const paths = []
    for (let i = start; i <= end; i++) {
      paths.push(`ROM/${folder}/${i}.dat`)
    }
    return paths
  }

  const fileNum = parseInt(fileSpec, 10)
  if (isNaN(fileNum)) return []
  return [`ROM/${folder}/${fileNum}.dat`]
}

/**
 * Expand a full path reference like "32/13-21;98/55" into an array of ROM paths.
 */
function expandPathRef(pathStr) {
  const segments = pathStr.split(';')
  const paths = []
  for (const seg of segments) {
    paths.push(...expandSegment(seg))
  }
  return paths
}

/**
 * Parse an Action.csv file with @Category headers and "paths,Name" lines.
 */
function parseActionCsv(text) {
  const entries = []
  let category = 'General'

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed.startsWith('@')) {
      category = trimmed.slice(1).trim()
      continue
    }

    const comma = trimmed.indexOf(',')
    if (comma < 0) continue

    const pathStr = trimmed.slice(0, comma).trim()
    const name = trimmed.slice(comma + 1).trim()
    if (!pathStr || !name) continue

    const paths = expandPathRef(pathStr)
    if (paths.length === 0) continue

    entries.push({ name, category, paths })
  }

  return entries
}

/**
 * Parse a Motion.csv file. Each line has two comma-separated path groups:
 * "animPaths, additionalPaths" — we combine them all.
 * Motion.csv has no names or categories, so we auto-label by line index.
 */
function parseMotionCsv(text) {
  const entries = []
  const MOTION_LABELS = [
    'Battle Stance',
    'Emote Set',
  ]

  let lineIdx = 0
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Motion.csv lines are "pathGroup1, pathGroup2" (two groups per line)
    // Split on comma+space to separate the two groups
    const parts = trimmed.split(/,\s*/)
    const allPaths = []
    for (const part of parts) {
      allPaths.push(...expandPathRef(part.trim()))
    }

    if (allPaths.length > 0) {
      const label = lineIdx < MOTION_LABELS.length
        ? MOTION_LABELS[lineIdx]
        : `Motion Set ${lineIdx + 1}`

      entries.push({
        name: label,
        category: 'Motion',
        paths: allPaths,
      })
    }
    lineIdx++
  }

  return entries
}

async function fetchCsv(url) {
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`  Failed to fetch ${url}: ${res.status}`)
    return null
  }
  return await res.text()
}

async function main() {
  console.log('Generating animation-paths.json from AltanaView PC data...\n')

  const result = {}
  let totalEntries = 0

  for (const { folder, raceId, label } of RACES) {
    console.log(`${label} (race ${raceId}):`)
    const raceEntries = []

    // Fetch Action.csv — named animations
    const actionText = await fetchCsv(`${BASE}/${folder}/Action.csv`)
    if (actionText) {
      const actions = parseActionCsv(actionText)
      raceEntries.push(...actions)
      console.log(`  Action.csv: ${actions.length} animations`)
    }

    // Fetch Motion.csv — base motion sets
    const motionText = await fetchCsv(`${BASE}/${folder}/Motion.csv`)
    if (motionText) {
      const motions = parseMotionCsv(motionText)
      raceEntries.push(...motions)
      console.log(`  Motion.csv: ${motions.length} motion sets`)
    }

    result[raceId] = raceEntries
    totalEntries += raceEntries.length
    console.log(`  Total: ${raceEntries.length} entries\n`)
  }

  console.log(`Grand total: ${totalEntries} animation entries across ${RACES.length} races`)

  const fs = await import('fs')
  const outPath = new URL('../public/data/animation-paths.json', import.meta.url).pathname
  const cleanPath = outPath.replace(/^\/([A-Z]:)/, '$1')
  fs.writeFileSync(cleanPath, JSON.stringify(result, null, 2))
  console.log(`Wrote ${cleanPath}`)
}

main().catch(console.error)
