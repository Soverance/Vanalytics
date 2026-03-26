/**
 * Generates model-dat-paths.json from AltanaView equipment CSVs + LandSandBoat item_equipment.sql.
 *
 * AltanaView provides ROM paths for every visual equipment model per race/slot.
 * LandSandBoat provides authoritative model IDs (MId) used by the game client.
 * The script cross-references them by normalized item name to produce a complete mapping.
 *
 * Run:    node scripts/generate-model-dat-paths.mjs
 * Output: public/data/model-dat-paths.json
 */

const AV_BASE = 'https://raw.githubusercontent.com/mynameisgonz/AltanaView/master/List/PC'
const LSB_EQUIP_URL = 'https://raw.githubusercontent.com/LandSandBoat/server/base/sql/item_equipment.sql'

const RACES = [
  { folder: 'HumeM',    raceId: 1, label: 'Hume Male' },
  { folder: 'HumeF',    raceId: 2, label: 'Hume Female' },
  { folder: 'ElvaanM',  raceId: 3, label: 'Elvaan Male' },
  { folder: 'ElvaanF',  raceId: 4, label: 'Elvaan Female' },
  { folder: 'Tarutaru', raceId: 5, label: 'Tarutaru' },
  { folder: 'Mithra',   raceId: 7, label: 'Mithra' },
  { folder: 'Galka',    raceId: 8, label: 'Galka' },
]

// Tarutaru M/F share models — race 6 reuses race 5 data
const TARU_FEMALE_RACE_ID = 6

const SLOTS = [
  { csv: 'Head.csv',  slotId: 2, label: 'Head' },
  { csv: 'Body.csv',  slotId: 3, label: 'Body' },
  { csv: 'Hands.csv', slotId: 4, label: 'Hands' },
  { csv: 'Legs.csv',  slotId: 5, label: 'Legs' },
  { csv: 'Feet.csv',  slotId: 6, label: 'Feet' },
  { csv: 'Main.csv',  slotId: 7, label: 'Main' },
  { csv: 'Sub.csv',   slotId: 8, label: 'Sub' },
  { csv: 'Range.csv', slotId: 9, label: 'Range' },
]

// item_equipment.sql slot bitmask → model slot ID
const SLOT_BITMASK_TO_ID = {
  1: 7, 2: 8, 3: 7, 4: 9,
  16: 2, 32: 3, 64: 4, 128: 5, 256: 6,
}

// Known abbreviations in LandSandBoat item names → full forms used by AltanaView
const ABBREVIATIONS = {
  'vlr': 'valor',
  'cab': 'caballarius',
  'ftrs': 'fighters',
  'tmpl': 'temple',
  'hlrs': 'healers',
  'wzds': 'wizards',
  'wlks': 'warlocks',
  'rgns': 'rogues',
  'glnt': 'gallant',
  'chs': 'chaos',
  'bsts': 'beast',
  'chrl': 'choral',
  'hntrs': 'hunters',
  'myochin': 'myochin',
  'koga': 'koga',
  'wyrm': 'wyrm',
  'smnrs': 'summoners',
  'dncrs': 'dancers',
  'schlrs': 'scholars',
  'mgs': 'magus',
  'crss': 'corsairs',
  'pptrn': 'puppetry',
  'mntr': 'monster',
  'brd': 'bards',
  'scts': 'scouts',
  'stms': 'saotome',
  'asn': 'assassins',
  'dsts': 'duelist',
  'srcs': 'sorcerers',
  'clrc': 'clerics',
  'mle': 'melee',
  'wrrs': 'warriors',
  'rvlrs': 'ravagers',
  'crd': 'creed',
  'jstcorps': 'justaucorps',
  'jstcrps': 'justaucorps',
  'o.bow': 'other bow',
}

/**
 * Normalize an item name for cross-reference matching.
 * Handles both LSB format ('vlr._surcoat_+2') and AV format ('Valor Surcoat (PLD AF2)').
 */
function normalizeName(name) {
  let n = name.toLowerCase()
  n = n.replace(/\s*\([^)]*af\d*\)\s*/gi, '')
  n = n.replace(/[_\s]*\+\d+/g, '')
  n = n.replace(/[_.]/g, ' ').replace(/\s+/g, ' ').trim()
  const words = n.split(' ')
  const expanded = words.map(w => ABBREVIATIONS[w] || w)
  n = expanded.join(' ')
  n = n.replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
  return n
}

/**
 * Load manual overrides from scripts/model-id-overrides.json.
 * Returns: Map<slotId, Map<MId, avIndex>>
 */
async function loadOverrides() {
  const fs = await import('fs')
  const overridePath = new URL('./model-id-overrides.json', import.meta.url).pathname
    .replace(/^\/([A-Z]:)/, '$1')

  try {
    const raw = JSON.parse(fs.readFileSync(overridePath, 'utf8'))
    const result = new Map()
    for (const [slotStr, entries] of Object.entries(raw)) {
      const slotId = parseInt(slotStr, 10)
      const map = new Map()
      for (const [midStr, avIdx] of Object.entries(entries)) {
        map.set(parseInt(midStr, 10), avIdx)
      }
      result.set(slotId, map)
    }
    const total = [...result.values()].reduce((sum, m) => sum + m.size, 0)
    if (total > 0) console.log(`Loaded ${total} manual overrides`)
    return result
  } catch {
    return new Map()
  }
}

/**
 * Fetch and parse LandSandBoat item_equipment.sql.
 * Returns: Map<slotId, Map<MId, Set<normalizedName>>>
 */
async function fetchLsbEquipment() {
  console.log('Fetching LandSandBoat item_equipment.sql...')
  const res = await fetch(LSB_EQUIP_URL)
  if (!res.ok) throw new Error(`Failed to fetch item_equipment.sql: ${res.status}`)
  const sql = await res.text()

  const regex = /\((\d+),'([^']*)',\d+,\d+,\d+,(\d+),\d+,\d+,(\d+),\d+,\d+,\d+\)/g
  const bySlot = new Map()

  let match
  let total = 0
  while ((match = regex.exec(sql)) !== null) {
    const name = match[2]
    const modelId = parseInt(match[3], 10)
    const slotBitmask = parseInt(match[4], 10)

    if (modelId <= 0) continue
    const slotId = SLOT_BITMASK_TO_ID[slotBitmask]
    if (!slotId) continue

    const normalized = normalizeName(name)
    const addToSlot = (sid) => {
      if (!bySlot.has(sid)) bySlot.set(sid, new Map())
      const slotMap = bySlot.get(sid)
      if (!slotMap.has(modelId)) slotMap.set(modelId, new Set())
      slotMap.get(modelId).add(normalized)
    }

    addToSlot(slotId)
    total++

    // Slot bitmask 3 = Main+Sub (dual-wieldable weapons).
    // Add to Sub slot too so cross-reference covers sub-hand models.
    if (slotBitmask === 3) {
      addToSlot(8)
      total++
    }
  }

  console.log(`  Parsed ${total} equipment entries across ${bySlot.size} slots`)
  return bySlot
}

/**
 * Parse an AltanaView equipment CSV into an array of { romPath, name, avIndex }.
 * Skips @Category headers and blank lines. Data-line index = AV model index.
 */
function parseEquipmentCsv(text) {
  const entries = []
  let dataIndex = 0

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('@')) continue

    const comma = trimmed.indexOf(',')
    if (comma < 0) continue

    const pathPart = trimmed.slice(0, comma).trim()
    const name = trimmed.slice(comma + 1).trim()

    const slash = pathPart.indexOf('/')
    if (slash < 0) continue
    const folder = pathPart.slice(0, slash)
    const file = pathPart.slice(slash + 1)
    const romPath = `ROM/${folder}/${file}.dat`

    entries.push({ avIndex: dataIndex, romPath, name })
    dataIndex++
  }

  return entries
}

/**
 * Fetch an AltanaView equipment CSV for a given race folder and slot CSV name.
 */
async function fetchAvCsv(raceFolder, csvName) {
  const url = `${AV_BASE}/${raceFolder}/${csvName}`
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`  Failed to fetch ${raceFolder}/${csvName}: ${res.status}`)
    return []
  }
  return parseEquipmentCsv(await res.text())
}

/**
 * Build a mapping from LSB MId → AV index for a given slot.
 */
function buildCrossReference(avEntries, lsbModels, overrides) {
  const midToAvIndex = new Map()
  const unmatchedMids = new Map()

  const avByName = new Map()
  for (const entry of avEntries) {
    const normalized = normalizeName(entry.name)
    if (normalized && !avByName.has(normalized)) {
      avByName.set(normalized, entry.avIndex)
    }
  }

  for (const [mid, nameSet] of lsbModels) {
    if (overrides?.has(mid)) {
      midToAvIndex.set(mid, overrides.get(mid))
      continue
    }

    if (mid < 50 && mid < avEntries.length) {
      midToAvIndex.set(mid, mid)
      continue
    }

    let matched = false
    for (const normalizedName of nameSet) {
      if (avByName.has(normalizedName)) {
        midToAvIndex.set(mid, avByName.get(normalizedName))
        matched = true
        break
      }
    }

    if (!matched) {
      unmatchedMids.set(mid, nameSet)
    }
  }

  return { midToAvIndex, unmatchedMids }
}

async function main() {
  console.log('Generating model-dat-paths.json...\n')

  const lsbData = await fetchLsbEquipment()
  const overrides = await loadOverrides()

  const output = {}
  const stats = []
  const allUnmatched = new Map()

  for (const { folder, raceId, label } of RACES) {
    console.log(`\n${label} (race ${raceId}):`)

    for (const { csv, slotId, label: slotLabel } of SLOTS) {
      const avEntries = await fetchAvCsv(folder, csv)
      if (avEntries.length === 0) continue

      const lsbModels = lsbData.get(slotId) || new Map()
      const slotOverrides = overrides.get(slotId) || null
      const { midToAvIndex, unmatchedMids } = buildCrossReference(avEntries, lsbModels, slotOverrides)

      const key = `${raceId}:${slotId}`
      const mapping = {}

      for (const [mid, avIdx] of midToAvIndex) {
        if (avIdx < avEntries.length) {
          mapping[String(mid)] = avEntries[avIdx].romPath
        }
      }

      const mappedAvIndices = new Set(midToAvIndex.values())
      for (const entry of avEntries) {
        if (!mappedAvIndices.has(entry.avIndex)) {
          const avKey = String(entry.avIndex)
          if (!(avKey in mapping)) {
            mapping[avKey] = entry.romPath
          }
        }
      }

      output[key] = mapping

      const mappedCount = Object.keys(mapping).length
      console.log(`  ${slotLabel}: ${mappedCount}/${avEntries.length} models mapped (${unmatchedMids.size} LSB MIds unmatched)`)

      stats.push({ raceId, slotId, slotLabel, mapped: mappedCount, total: avEntries.length, unmatched: unmatchedMids.size })

      if (raceId === 1 && unmatchedMids.size > 0) {
        allUnmatched.set(slotId, unmatchedMids)
      }
    }
  }

  for (const { slotId } of SLOTS) {
    const srcKey = `5:${slotId}`
    const dstKey = `${TARU_FEMALE_RACE_ID}:${slotId}`
    if (output[srcKey]) {
      output[dstKey] = { ...output[srcKey] }
    }
  }

  // 5. Merge in existing entries as fallback (never regress)
  const fs = await import('fs')
  const outPath = new URL('../public/data/model-dat-paths.json', import.meta.url).pathname
    .replace(/^\/([A-Z]:)/, '$1')
  let preserved = 0
  try {
    const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'))
    for (const key of Object.keys(existing)) {
      if (!output[key]) output[key] = {}
      for (const [mid, path] of Object.entries(existing[key])) {
        if (!(mid in output[key])) {
          output[key][mid] = path
          preserved++
        }
      }
    }
    if (preserved > 0) console.log(`\nPreserved ${preserved} existing entries not found via cross-reference`)
  } catch {
    // No existing file — first run
  }

  const sorted = {}
  for (const key of Object.keys(output).sort()) {
    const inner = {}
    for (const mid of Object.keys(output[key]).sort((a, b) => Number(a) - Number(b))) {
      inner[mid] = output[key][mid]
    }
    sorted[key] = inner
  }

  fs.writeFileSync(outPath, JSON.stringify(sorted, null, 2))
  console.log(`\nWrote ${outPath}`)

  console.log('\n=== Coverage Summary ===')
  for (const { slotLabel, raceId, mapped, total, unmatched } of stats) {
    if (raceId !== 1) continue
    const pct = total > 0 ? Math.round(mapped / total * 100) : 0
    console.log(`  ${slotLabel}: ${mapped}/${total} (${pct}%) — ${unmatched} unmatched LSB MIds`)
  }

  if (allUnmatched.size > 0) {
    console.log('\n=== Unmatched LSB Model IDs (add to model-id-overrides.json) ===')
    for (const [slotId, mids] of allUnmatched) {
      const slotLabel = SLOTS.find(s => s.slotId === slotId)?.label || `Slot ${slotId}`
      console.log(`\n  ${slotLabel}:`)
      for (const [mid, names] of mids) {
        console.log(`    MId ${mid}: ${[...names].join(', ')}`)
      }
    }
  }

  console.log('\n=== Spot Checks ===')
  const checks = [
    ['1:3', '1', 'ROM/28/8.dat', 'Leather Vest'],
    ['1:3', '77', 'ROM/131/35.dat', 'Valor Surcoat'],
    ['1:3', '76', 'ROM/95/92.dat', 'Gallant Surcoat'],
    ['1:3', '64', null, "Fighter's Lorica"],
  ]
  for (const [key, mid, expectedPath, label] of checks) {
    const actual = sorted[key]?.[mid]
    if (expectedPath) {
      const status = actual === expectedPath ? 'PASS' : `FAIL (got ${actual})`
      console.log(`  ${key}[${mid}] = ${actual} [${status}] ${label}`)
    } else {
      const status = actual ? 'PASS (has path)' : 'FAIL (missing)'
      console.log(`  ${key}[${mid}] = ${actual} [${status}] ${label}`)
    }
  }
}

main().catch(err => { console.error(err); process.exit(1) })
