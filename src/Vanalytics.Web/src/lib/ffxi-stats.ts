// FFXI character stat calculation engine
// Data sourced from LandSandBoat's grades.cpp and charutils.cpp

// Stat grades: 1=A (best) through 7=G (worst), 0=none
// Order: [HP, MP, STR, DEX, VIT, AGI, INT, MND, CHR]

const RACE_GRADES: Record<string, number[]> = {
  Hume:     [4, 4, 4, 4, 4, 4, 4, 4, 4],
  Elvaan:   [3, 5, 2, 5, 3, 6, 6, 2, 4],
  Tarutaru: [7, 1, 6, 4, 5, 3, 1, 5, 4],
  Mithra:   [4, 4, 5, 1, 5, 2, 4, 5, 6],
  Galka:    [1, 7, 3, 4, 1, 5, 5, 4, 6],
}

const JOB_GRADES: Record<string, number[]> = {
  WAR: [2, 0, 1, 3, 4, 3, 6, 6, 5],
  MNK: [1, 0, 3, 2, 1, 6, 7, 4, 5],
  WHM: [5, 3, 4, 6, 4, 5, 5, 1, 3],
  BLM: [6, 2, 6, 3, 6, 3, 1, 5, 4],
  RDM: [4, 4, 4, 4, 5, 5, 3, 3, 4],
  THF: [4, 0, 4, 1, 4, 2, 3, 7, 7],
  PLD: [3, 6, 2, 5, 1, 7, 7, 3, 3],
  DRK: [3, 6, 1, 3, 3, 4, 3, 7, 7],
  BST: [3, 0, 4, 3, 4, 6, 5, 5, 1],
  BRD: [4, 0, 4, 4, 4, 6, 4, 4, 2],
  RNG: [5, 0, 5, 4, 4, 1, 5, 4, 5],
  SAM: [2, 0, 3, 3, 3, 4, 5, 5, 4],
  NIN: [4, 0, 3, 2, 3, 2, 4, 7, 6],
  DRG: [3, 0, 2, 4, 3, 4, 6, 5, 3],
  SMN: [7, 1, 6, 5, 6, 4, 2, 2, 2],
  BLU: [4, 4, 5, 5, 5, 5, 5, 5, 5],
  COR: [4, 0, 5, 3, 5, 2, 3, 5, 5],
  PUP: [4, 0, 5, 2, 4, 3, 5, 6, 3],
  DNC: [4, 0, 4, 3, 5, 2, 6, 6, 2],
  SCH: [5, 4, 6, 4, 5, 4, 3, 4, 3],
  GEO: [3, 2, 6, 4, 5, 4, 3, 3, 4],
  RUN: [3, 6, 3, 4, 5, 2, 4, 4, 6],
}

// HP scale: [base, scaleTo60, scaleOver30, scaleOver60, scaleOver75]
const HP_SCALE: number[][] = [
  [0,  0, 0, 0, 0], // grade 0 (none)
  [19, 9, 1, 3, 3], // grade 1 (A)
  [17, 8, 1, 3, 3], // grade 2 (B)
  [16, 7, 1, 3, 3], // grade 3 (C)
  [14, 6, 0, 3, 3], // grade 4 (D)
  [13, 5, 0, 2, 2], // grade 5 (E)
  [11, 4, 0, 2, 2], // grade 6 (F)
  [10, 3, 0, 2, 2], // grade 7 (G)
]

// MP scale: [base, scaleTo60, scaleOver60]
const MP_SCALE: number[][] = [
  [0,  0,   0],   // grade 0 (none)
  [16, 6,   4],   // grade 1 (A)
  [14, 5,   4],   // grade 2 (B)
  [12, 4,   4],   // grade 3 (C)
  [10, 3,   4],   // grade 4 (D)
  [8,  2,   3],   // grade 5 (E)
  [6,  1,   2],   // grade 6 (F)
  [4,  0.5, 1],   // grade 7 (G)
]

// Stat scale (STR-CHR): [base, scaleTo60, scaleOver60, scaleOver75]
const STAT_SCALE: number[][] = [
  [0, 0,    0,    0],    // grade 0 (none)
  [5, 0.50, 0.10, 0.35], // grade 1 (A)
  [4, 0.45, 0.20, 0.35], // grade 2 (B)
  [4, 0.40, 0.25, 0.35], // grade 3 (C)
  [3, 0.35, 0.35, 0.35], // grade 4 (D)
  [3, 0.30, 0.35, 0.35], // grade 5 (E)
  [2, 0.25, 0.40, 0.35], // grade 6 (F)
  [2, 0.20, 0.40, 0.35], // grade 7 (G)
]

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

/** Map race string (+ optional gender) to the race key used in RACE_GRADES */
function toRaceKey(race?: string, _gender?: string): string | null {
  if (!race) return null
  // Gender does not affect stats in FFXI — normalize to race name only
  const r = race.replace(/\s*(♂|♀|Male|Female)/i, '').trim()
  // Handle common variants
  if (r.startsWith('Hume')) return 'Hume'
  if (r.startsWith('Elvaan')) return 'Elvaan'
  if (r.startsWith('Taru')) return 'Tarutaru'
  if (r === 'Mithra') return 'Mithra'
  if (r === 'Galka') return 'Galka'
  return null
}

function calcHP(grade: number, level: number): number {
  if (grade === 0 || level <= 0) return 0
  const s = HP_SCALE[grade]
  const lvlUpTo60 = Math.min(level - 1, 59)
  const lvlOver30 = clamp(level - 30, 0, 30)
  const lvlOver60 = clamp(level - 60, 0, 15)
  const lvlOver75 = level >= 75 ? level - 75 : 0
  return s[0] + s[1] * lvlUpTo60 + s[2] * lvlOver30 + s[3] * lvlOver60 + s[4] * lvlOver75
}

function calcSubHP(grade: number, level: number): number {
  if (grade === 0 || level <= 0) return 0
  const s = HP_SCALE[grade]
  const subOver10 = clamp(level - 10, 0, 20)
  const subOver30 = level >= 30 ? level - 30 : 0
  // The bare subOver30 + subOver10 are flat per-level bonuses from LandSandBoat charutils.cpp,
  // separate from the scale table's scaleOver30 multiplier. All halved for sub job.
  return Math.floor((s[0] + s[1] * (level - 1) + s[2] * subOver30 + subOver30 + subOver10) / 2)
}

function calcMP(grade: number, level: number): number {
  if (grade === 0 || level <= 0) return 0
  const s = MP_SCALE[grade]
  const lvlUpTo60 = Math.min(level - 1, 59)
  const lvlOver60 = level >= 60 ? level - 60 : 0
  return Math.floor(s[0] + s[1] * lvlUpTo60 + s[2] * lvlOver60)
}

function calcSubMP(grade: number, level: number): number {
  if (grade === 0 || level <= 0) return 0
  const s = MP_SCALE[grade]
  return Math.floor((s[0] + s[1] * (level - 1)) / 2)
}

function calcStat(grade: number, level: number): number {
  if (grade === 0 || level <= 0) return 0
  const s = STAT_SCALE[grade]
  let val = s[0] + s[1] * Math.min(level - 1, 59)
  if (level > 60) val += s[2] * (level - 60)
  if (level > 75) val += s[3] * (level - 75) - 0.01
  return val // floored after summing race + job + sub
}

function calcSubStat(grade: number, level: number): number {
  if (grade === 0 || level <= 0) return 0
  const s = STAT_SCALE[grade]
  return (s[0] + s[1] * (level - 1)) / 2
}

export interface BaseStats {
  hp: number
  mp: number
  str: number
  dex: number
  vit: number
  agi: number
  int: number
  mnd: number
  chr: number
}

export const STAT_KEYS: (keyof BaseStats)[] = ['hp', 'mp', 'str', 'dex', 'vit', 'agi', 'int', 'mnd', 'chr']

// Master level bonuses — flat per ML (source: BGWiki Master Levels)
const ML_BONUS_PER_LEVEL: BaseStats = {
  hp: 7, mp: 2, str: 1, dex: 1, vit: 1, agi: 1, int: 1, mnd: 1, chr: 1,
}

export function calculateBaseStats(
  race: string | undefined,
  gender: string | undefined,
  mainJob: string | undefined,
  mainLevel: number,
  subJob: string | undefined,
  subJobLevel: number,
  masterLevel: number = 0,
): BaseStats {
  const result: BaseStats = { hp: 0, mp: 0, str: 0, dex: 0, vit: 0, agi: 0, int: 0, mnd: 0, chr: 0 }

  const raceKey = toRaceKey(race, gender)
  if (!raceKey || !mainJob) return result

  const raceGrades = RACE_GRADES[raceKey]
  const jobGrades = JOB_GRADES[mainJob]
  if (!raceGrades || !jobGrades) return result

  const subGrades = subJob ? JOB_GRADES[subJob] : null
  const sLvl = Math.min(subJobLevel, Math.floor(mainLevel / 2))

  // HP — bonus HP is a flat per-level addition from LandSandBoat charutils.cpp:
  // (level-10) for levels 10+ plus (level-50) clamped to 0-10, all multiplied by 2
  const bonusHP = (mainLevel >= 10 ? mainLevel - 10 : 0) + clamp(mainLevel - 50, 0, 10)
  result.hp = calcHP(raceGrades[0], mainLevel) + calcHP(jobGrades[0], mainLevel) + bonusHP * 2
  if (subGrades) result.hp += calcSubHP(subGrades[0], sLvl)

  // MP — special case: if main job has no MP (grade 0), only get race MP if sub job has MP
  const mainHasMP = jobGrades[1] > 0
  const subHasMP = subGrades ? subGrades[1] > 0 : false

  if (mainHasMP) {
    result.mp = calcMP(raceGrades[1], mainLevel) + calcMP(jobGrades[1], mainLevel)
    if (subGrades) result.mp += calcSubMP(subGrades[1], sLvl)
  } else if (subHasMP) {
    // Non-mage main with mage sub: race MP at sub level / 2
    result.mp = Math.floor(calcMP(raceGrades[1], sLvl) / 2)
    if (subGrades) result.mp += calcSubMP(subGrades[1], sLvl)
  }

  // Core stats (STR through CHR, indices 2-8)
  for (let i = 2; i <= 8; i++) {
    const key = STAT_KEYS[i]
    let val = calcStat(raceGrades[i], mainLevel) + calcStat(jobGrades[i], mainLevel)
    if (subGrades) val += calcSubStat(subGrades[i], sLvl)
    result[key] = Math.floor(val)
  }

  // Master level bonuses
  if (masterLevel > 0) {
    for (const key of STAT_KEYS) {
      result[key] += masterLevel * ML_BONUS_PER_LEVEL[key]
    }
  }

  return result
}

// --- JP Gift System ---
// Automatic combat stat bonuses unlocked at JP-spent thresholds per job.
// Source: LandSandBoat job_point_gifts.sql
// Each entry: [jpSpentThreshold, cumulativeValue]
// The highest threshold <= jpSpent determines the active bonus.

interface JPGiftTier { threshold: number; value: number }

// Maps job abbreviation → combat stat key → tiers
// Combat stat keys match GameItemDetail field names used in StatusPanel
const JP_GIFTS: Record<string, Record<string, JPGiftTier[]>> = {
  WAR: {
    def:          [{ threshold: 5, value: 10 }, { threshold: 180, value: 15 }, { threshold: 605, value: 20 }, { threshold: 1280, value: 25 }],
    attack:       [{ threshold: 10, value: 10 }, { threshold: 210, value: 15 }, { threshold: 660, value: 20 }, { threshold: 1360, value: 25 }],
    evasion:      [{ threshold: 20, value: 5 }, { threshold: 245, value: 8 }, { threshold: 720, value: 10 }, { threshold: 1445, value: 13 }],
    accuracy:     [{ threshold: 30, value: 5 }, { threshold: 280, value: 8 }, { threshold: 780, value: 10 }, { threshold: 1530, value: 13 }],
    magicEvasion: [{ threshold: 35, value: 5 }, { threshold: 320, value: 8 }, { threshold: 845, value: 10 }, { threshold: 1620, value: 13 }],
    magicAccuracy:[{ threshold: 40, value: 5 }, { threshold: 360, value: 8 }, { threshold: 910, value: 10 }, { threshold: 1710, value: 13 }],
  },
  MNK: {
    def:          [{ threshold: 5, value: 5 }, { threshold: 180, value: 8 }, { threshold: 605, value: 10 }, { threshold: 1280, value: 13 }],
    attack:       [{ threshold: 10, value: 8 }, { threshold: 210, value: 12 }, { threshold: 660, value: 16 }, { threshold: 1360, value: 20 }],
    evasion:      [{ threshold: 20, value: 6 }, { threshold: 245, value: 9 }, { threshold: 720, value: 12 }, { threshold: 1445, value: 15 }],
    accuracy:     [{ threshold: 30, value: 6 }, { threshold: 280, value: 9 }, { threshold: 780, value: 12 }, { threshold: 1530, value: 15 }],
    magicEvasion: [{ threshold: 35, value: 5 }, { threshold: 320, value: 8 }, { threshold: 845, value: 10 }, { threshold: 1620, value: 13 }],
    magicAccuracy:[{ threshold: 40, value: 5 }, { threshold: 360, value: 8 }, { threshold: 910, value: 10 }, { threshold: 1710, value: 13 }],
  },
  WHM: {
    accuracy:     [{ threshold: 5, value: 2 }, { threshold: 180, value: 3 }, { threshold: 605, value: 4 }, { threshold: 1280, value: 5 }],
    magicEvasion: [{ threshold: 10, value: 7 }, { threshold: 210, value: 11 }, { threshold: 660, value: 14 }, { threshold: 1360, value: 18 }],
    magicAccuracy:[{ threshold: 20, value: 7 }, { threshold: 245, value: 11 }, { threshold: 720, value: 14 }, { threshold: 1445, value: 18 }],
    magicDamage:  [{ threshold: 35, value: 3 }, { threshold: 320, value: 5 }, { threshold: 845, value: 6 }, { threshold: 1620, value: 8 }],
  },
  BLM: {
    magicEvasion: [{ threshold: 5, value: 6 }, { threshold: 180, value: 9 }, { threshold: 605, value: 12 }, { threshold: 1280, value: 15 }],
    magicAccuracy:[{ threshold: 10, value: 6 }, { threshold: 210, value: 9 }, { threshold: 660, value: 12 }, { threshold: 1360, value: 15 }],
    magicDamage:  [{ threshold: 30, value: 7 }, { threshold: 280, value: 11 }, { threshold: 780, value: 14 }, { threshold: 1530, value: 18 }],
  },
  RDM: {
    accuracy:     [{ threshold: 5, value: 3 }, { threshold: 180, value: 5 }, { threshold: 605, value: 6 }, { threshold: 1280, value: 8 }],
    magicEvasion: [{ threshold: 10, value: 8 }, { threshold: 210, value: 12 }, { threshold: 660, value: 16 }, { threshold: 1360, value: 20 }],
    magicAccuracy:[{ threshold: 20, value: 10 }, { threshold: 245, value: 15 }, { threshold: 720, value: 20 }, { threshold: 1445, value: 25 }],
    magicDamage:  [{ threshold: 35, value: 4 }, { threshold: 320, value: 6 }, { threshold: 845, value: 8 }, { threshold: 1620, value: 10 }],
  },
  THF: {
    def:          [{ threshold: 5, value: 4 }, { threshold: 180, value: 6 }, { threshold: 605, value: 8 }, { threshold: 1280, value: 10 }],
    attack:       [{ threshold: 10, value: 7 }, { threshold: 210, value: 11 }, { threshold: 660, value: 14 }, { threshold: 1360, value: 18 }],
    evasion:      [{ threshold: 20, value: 10 }, { threshold: 245, value: 15 }, { threshold: 720, value: 20 }, { threshold: 1445, value: 25 }],
    accuracy:     [{ threshold: 30, value: 5 }, { threshold: 280, value: 8 }, { threshold: 780, value: 10 }, { threshold: 1530, value: 13 }],
    magicEvasion: [{ threshold: 35, value: 5 }, { threshold: 320, value: 8 }, { threshold: 845, value: 10 }, { threshold: 1620, value: 13 }],
    magicAccuracy:[{ threshold: 40, value: 5 }, { threshold: 360, value: 8 }, { threshold: 910, value: 10 }, { threshold: 1710, value: 13 }],
  },
  PLD: {
    def:          [{ threshold: 5, value: 15 }, { threshold: 180, value: 23 }, { threshold: 605, value: 30 }, { threshold: 1280, value: 38 }],
    attack:       [{ threshold: 10, value: 4 }, { threshold: 210, value: 6 }, { threshold: 660, value: 8 }, { threshold: 1360, value: 10 }],
    evasion:      [{ threshold: 20, value: 3 }, { threshold: 245, value: 5 }, { threshold: 720, value: 6 }, { threshold: 1445, value: 8 }],
    accuracy:     [{ threshold: 30, value: 4 }, { threshold: 280, value: 6 }, { threshold: 780, value: 8 }, { threshold: 1530, value: 10 }],
    magicEvasion: [{ threshold: 35, value: 6 }, { threshold: 320, value: 9 }, { threshold: 845, value: 12 }, { threshold: 1620, value: 15 }],
    magicAccuracy:[{ threshold: 40, value: 6 }, { threshold: 360, value: 9 }, { threshold: 910, value: 12 }, { threshold: 1710, value: 15 }],
  },
  DRK: {
    def:          [{ threshold: 5, value: 4 }, { threshold: 180, value: 6 }, { threshold: 605, value: 8 }, { threshold: 1280, value: 10 }],
    attack:       [{ threshold: 10, value: 15 }, { threshold: 210, value: 23 }, { threshold: 660, value: 30 }, { threshold: 1360, value: 38 }],
    evasion:      [{ threshold: 20, value: 3 }, { threshold: 245, value: 5 }, { threshold: 720, value: 6 }, { threshold: 1445, value: 8 }],
    accuracy:     [{ threshold: 30, value: 3 }, { threshold: 280, value: 5 }, { threshold: 780, value: 6 }, { threshold: 1530, value: 8 }],
    magicEvasion: [{ threshold: 35, value: 6 }, { threshold: 320, value: 9 }, { threshold: 845, value: 12 }, { threshold: 1620, value: 15 }],
    magicAccuracy:[{ threshold: 40, value: 6 }, { threshold: 360, value: 9 }, { threshold: 910, value: 12 }, { threshold: 1710, value: 15 }],
  },
  BST: {
    def:          [{ threshold: 5, value: 10 }, { threshold: 180, value: 15 }, { threshold: 605, value: 20 }, { threshold: 1280, value: 25 }],
    attack:       [{ threshold: 10, value: 10 }, { threshold: 210, value: 15 }, { threshold: 660, value: 20 }, { threshold: 1360, value: 25 }],
    evasion:      [{ threshold: 20, value: 5 }, { threshold: 245, value: 8 }, { threshold: 720, value: 10 }, { threshold: 1445, value: 13 }],
    accuracy:     [{ threshold: 30, value: 5 }, { threshold: 280, value: 8 }, { threshold: 780, value: 10 }, { threshold: 1530, value: 13 }],
    magicEvasion: [{ threshold: 35, value: 5 }, { threshold: 320, value: 8 }, { threshold: 845, value: 10 }, { threshold: 1620, value: 13 }],
    magicAccuracy:[{ threshold: 40, value: 5 }, { threshold: 360, value: 8 }, { threshold: 910, value: 10 }, { threshold: 1710, value: 13 }],
  },
  BRD: {
    def:          [{ threshold: 5, value: 3 }, { threshold: 180, value: 5 }, { threshold: 605, value: 6 }, { threshold: 1280, value: 8 }],
    evasion:      [{ threshold: 20, value: 3 }, { threshold: 245, value: 5 }, { threshold: 720, value: 6 }, { threshold: 1445, value: 8 }],
    accuracy:     [{ threshold: 30, value: 2 }, { threshold: 280, value: 5 }, { threshold: 780, value: 6 }, { threshold: 1530, value: 8 }],
    magicEvasion: [{ threshold: 35, value: 5 }, { threshold: 320, value: 8 }, { threshold: 845, value: 10 }, { threshold: 1620, value: 13 }],
    magicAccuracy:[{ threshold: 40, value: 5 }, { threshold: 360, value: 8 }, { threshold: 910, value: 10 }, { threshold: 1710, value: 13 }],
  },
  RNG: {
    def:          [{ threshold: 5, value: 3 }, { threshold: 180, value: 5 }, { threshold: 605, value: 6 }, { threshold: 1280, value: 8 }],
    attack:       [{ threshold: 10, value: 10 }, { threshold: 210, value: 15 }, { threshold: 660, value: 20 }, { threshold: 1360, value: 25 }],
    evasion:      [{ threshold: 20, value: 2 }, { threshold: 245, value: 3 }, { threshold: 720, value: 4 }, { threshold: 1445, value: 5 }],
    accuracy:     [{ threshold: 30, value: 10 }, { threshold: 280, value: 15 }, { threshold: 780, value: 20 }, { threshold: 1530, value: 25 }],
    magicEvasion: [{ threshold: 35, value: 5 }, { threshold: 320, value: 8 }, { threshold: 845, value: 10 }, { threshold: 1620, value: 13 }],
    magicAccuracy:[{ threshold: 40, value: 5 }, { threshold: 360, value: 8 }, { threshold: 910, value: 10 }, { threshold: 1710, value: 13 }],
  },
  SAM: {
    def:          [{ threshold: 5, value: 10 }, { threshold: 180, value: 15 }, { threshold: 605, value: 20 }, { threshold: 1280, value: 25 }],
    attack:       [{ threshold: 10, value: 10 }, { threshold: 210, value: 15 }, { threshold: 660, value: 20 }, { threshold: 1360, value: 25 }],
    evasion:      [{ threshold: 20, value: 5 }, { threshold: 245, value: 8 }, { threshold: 720, value: 10 }, { threshold: 1445, value: 13 }],
    accuracy:     [{ threshold: 30, value: 5 }, { threshold: 280, value: 8 }, { threshold: 780, value: 10 }, { threshold: 1530, value: 13 }],
    magicEvasion: [{ threshold: 35, value: 5 }, { threshold: 320, value: 8 }, { threshold: 845, value: 10 }, { threshold: 1620, value: 13 }],
    magicAccuracy:[{ threshold: 40, value: 5 }, { threshold: 360, value: 8 }, { threshold: 910, value: 10 }, { threshold: 1710, value: 13 }],
  },
  NIN: {
    def:          [{ threshold: 5, value: 8 }, { threshold: 180, value: 12 }, { threshold: 605, value: 16 }, { threshold: 1280, value: 20 }],
    attack:       [{ threshold: 10, value: 10 }, { threshold: 210, value: 15 }, { threshold: 660, value: 20 }, { threshold: 1360, value: 25 }],
    evasion:      [{ threshold: 20, value: 9 }, { threshold: 245, value: 14 }, { threshold: 720, value: 18 }, { threshold: 1445, value: 23 }],
    accuracy:     [{ threshold: 30, value: 8 }, { threshold: 280, value: 12 }, { threshold: 780, value: 16 }, { threshold: 1530, value: 20 }],
    magicEvasion: [{ threshold: 35, value: 7 }, { threshold: 320, value: 11 }, { threshold: 845, value: 14 }, { threshold: 1620, value: 18 }],
    magicAccuracy:[{ threshold: 40, value: 7 }, { threshold: 360, value: 11 }, { threshold: 910, value: 14 }, { threshold: 1710, value: 18 }],
    magicDamage:  [{ threshold: 45, value: 4 }, { threshold: 400, value: 6 }, { threshold: 980, value: 8 }, { threshold: 1800, value: 10 }],
  },
  DRG: {
    def:          [{ threshold: 5, value: 10 }, { threshold: 180, value: 15 }, { threshold: 605, value: 20 }, { threshold: 1280, value: 25 }],
    attack:       [{ threshold: 10, value: 10 }, { threshold: 210, value: 15 }, { threshold: 660, value: 20 }, { threshold: 1360, value: 25 }],
    evasion:      [{ threshold: 20, value: 5 }, { threshold: 245, value: 8 }, { threshold: 720, value: 10 }, { threshold: 1445, value: 13 }],
    accuracy:     [{ threshold: 30, value: 9 }, { threshold: 280, value: 14 }, { threshold: 780, value: 18 }, { threshold: 1530, value: 23 }],
    magicEvasion: [{ threshold: 35, value: 5 }, { threshold: 320, value: 8 }, { threshold: 845, value: 10 }, { threshold: 1620, value: 13 }],
    magicAccuracy:[{ threshold: 40, value: 5 }, { threshold: 360, value: 8 }, { threshold: 910, value: 10 }, { threshold: 1710, value: 13 }],
  },
  SMN: {
    def:          [{ threshold: 5, value: 3 }, { threshold: 180, value: 5 }, { threshold: 605, value: 6 }, { threshold: 1280, value: 8 }],
    evasion:      [{ threshold: 20, value: 3 }, { threshold: 245, value: 5 }, { threshold: 720, value: 6 }, { threshold: 1445, value: 8 }],
    magicEvasion: [{ threshold: 35, value: 3 }, { threshold: 320, value: 5 }, { threshold: 845, value: 6 }, { threshold: 1620, value: 8 }],
  },
  BLU: {
    def:          [{ threshold: 5, value: 10 }, { threshold: 180, value: 15 }, { threshold: 605, value: 20 }, { threshold: 1280, value: 25 }],
    attack:       [{ threshold: 10, value: 10 }, { threshold: 210, value: 15 }, { threshold: 660, value: 20 }, { threshold: 1360, value: 25 }],
    evasion:      [{ threshold: 20, value: 5 }, { threshold: 245, value: 8 }, { threshold: 720, value: 10 }, { threshold: 1445, value: 13 }],
    accuracy:     [{ threshold: 30, value: 5 }, { threshold: 280, value: 8 }, { threshold: 780, value: 10 }, { threshold: 1530, value: 13 }],
    magicEvasion: [{ threshold: 35, value: 5 }, { threshold: 320, value: 8 }, { threshold: 845, value: 10 }, { threshold: 1620, value: 13 }],
    magicAccuracy:[{ threshold: 40, value: 5 }, { threshold: 360, value: 8 }, { threshold: 910, value: 10 }, { threshold: 1710, value: 13 }],
    magicDamage:  [{ threshold: 45, value: 5 }, { threshold: 400, value: 8 }, { threshold: 980, value: 10 }, { threshold: 1800, value: 13 }],
  },
  COR: {
    def:          [{ threshold: 5, value: 3 }, { threshold: 180, value: 5 }, { threshold: 605, value: 6 }, { threshold: 1280, value: 8 }],
    attack:       [{ threshold: 10, value: 5 }, { threshold: 210, value: 8 }, { threshold: 660, value: 10 }, { threshold: 1360, value: 13 }],
    evasion:      [{ threshold: 20, value: 3 }, { threshold: 245, value: 5 }, { threshold: 720, value: 6 }, { threshold: 1445, value: 8 }],
    accuracy:     [{ threshold: 30, value: 5 }, { threshold: 280, value: 8 }, { threshold: 780, value: 10 }, { threshold: 1530, value: 13 }],
    magicEvasion: [{ threshold: 35, value: 5 }, { threshold: 320, value: 8 }, { threshold: 845, value: 10 }, { threshold: 1620, value: 13 }],
    magicAccuracy:[{ threshold: 40, value: 5 }, { threshold: 360, value: 8 }, { threshold: 910, value: 10 }, { threshold: 1710, value: 13 }],
    magicDamage:  [{ threshold: 45, value: 2 }, { threshold: 400, value: 3 }, { threshold: 980, value: 4 }, { threshold: 1800, value: 5 }],
  },
  PUP: {
    attack:       [{ threshold: 10, value: 6 }, { threshold: 210, value: 9 }, { threshold: 660, value: 12 }, { threshold: 1360, value: 15 }],
    evasion:      [{ threshold: 20, value: 8 }, { threshold: 245, value: 12 }, { threshold: 720, value: 16 }, { threshold: 1445, value: 20 }],
    accuracy:     [{ threshold: 30, value: 7 }, { threshold: 280, value: 11 }, { threshold: 780, value: 14 }, { threshold: 1530, value: 18 }],
    magicEvasion: [{ threshold: 35, value: 5 }, { threshold: 320, value: 8 }, { threshold: 845, value: 10 }, { threshold: 1620, value: 13 }],
    magicAccuracy:[{ threshold: 40, value: 5 }, { threshold: 360, value: 8 }, { threshold: 910, value: 10 }, { threshold: 1710, value: 13 }],
  },
  DNC: {
    def:          [{ threshold: 5, value: 6 }, { threshold: 180, value: 9 }, { threshold: 605, value: 12 }, { threshold: 1280, value: 15 }],
    attack:       [{ threshold: 10, value: 6 }, { threshold: 210, value: 9 }, { threshold: 660, value: 12 }, { threshold: 1360, value: 15 }],
    evasion:      [{ threshold: 20, value: 9 }, { threshold: 245, value: 14 }, { threshold: 720, value: 18 }, { threshold: 1445, value: 23 }],
    accuracy:     [{ threshold: 30, value: 9 }, { threshold: 280, value: 14 }, { threshold: 780, value: 18 }, { threshold: 1530, value: 23 }],
    magicEvasion: [{ threshold: 35, value: 5 }, { threshold: 320, value: 8 }, { threshold: 845, value: 10 }, { threshold: 1620, value: 13 }],
    magicAccuracy:[{ threshold: 40, value: 5 }, { threshold: 360, value: 8 }, { threshold: 910, value: 10 }, { threshold: 1710, value: 13 }],
  },
  SCH: {
    magicEvasion: [{ threshold: 5, value: 6 }, { threshold: 180, value: 9 }, { threshold: 605, value: 12 }, { threshold: 1280, value: 15 }],
    magicAccuracy:[{ threshold: 10, value: 6 }, { threshold: 210, value: 9 }, { threshold: 660, value: 12 }, { threshold: 1360, value: 15 }],
    magicDamage:  [{ threshold: 30, value: 5 }, { threshold: 280, value: 8 }, { threshold: 780, value: 10 }, { threshold: 1530, value: 13 }],
  },
  GEO: {
    magicEvasion: [{ threshold: 5, value: 7 }, { threshold: 180, value: 11 }, { threshold: 605, value: 14 }, { threshold: 1280, value: 18 }],
    magicAccuracy:[{ threshold: 10, value: 7 }, { threshold: 210, value: 11 }, { threshold: 660, value: 14 }, { threshold: 1360, value: 18 }],
    magicDamage:  [{ threshold: 30, value: 6 }, { threshold: 280, value: 9 }, { threshold: 780, value: 12 }, { threshold: 1530, value: 15 }],
  },
  RUN: {
    def:          [{ threshold: 5, value: 5 }, { threshold: 180, value: 8 }, { threshold: 605, value: 10 }, { threshold: 1280, value: 13 }],
    attack:       [{ threshold: 10, value: 7 }, { threshold: 210, value: 11 }, { threshold: 660, value: 14 }, { threshold: 1360, value: 18 }],
    evasion:      [{ threshold: 20, value: 8 }, { threshold: 245, value: 12 }, { threshold: 720, value: 16 }, { threshold: 1445, value: 20 }],
    accuracy:     [{ threshold: 30, value: 8 }, { threshold: 280, value: 12 }, { threshold: 780, value: 16 }, { threshold: 1530, value: 20 }],
    magicEvasion: [{ threshold: 35, value: 10 }, { threshold: 320, value: 15 }, { threshold: 845, value: 20 }, { threshold: 1620, value: 25 }],
    magicAccuracy:[{ threshold: 40, value: 5 }, { threshold: 360, value: 8 }, { threshold: 910, value: 10 }, { threshold: 1710, value: 13 }],
  },
}

/** Get JP gift bonuses for a job given total JP spent. Returns a map of combat stat key → bonus value. */
export function getJPGiftBonuses(job: string, jpSpent: number): Record<string, number> {
  const result: Record<string, number> = {}
  const gifts = JP_GIFTS[job]
  if (!gifts) return result

  for (const [statKey, tiers] of Object.entries(gifts)) {
    let bonus = 0
    for (const tier of tiers) {
      if (jpSpent >= tier.threshold) bonus = tier.value
    }
    if (bonus > 0) result[statKey] = bonus
  }
  return result
}
