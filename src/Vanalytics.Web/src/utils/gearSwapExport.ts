export interface GearSetSlot {
  slot: string      // internal grid name: Main, Sub, ..., Feet
  itemId: number    // 0 = empty
  itemName: string
  augments: string[]
}

// Internal grid slot -> GearSwap key, in canonical equip order.
const SLOT_TO_GEARSWAP: ReadonlyArray<readonly [string, string]> = [
  ['Main', 'main'], ['Sub', 'sub'], ['Range', 'range'], ['Ammo', 'ammo'],
  ['Head', 'head'], ['Neck', 'neck'], ['Ear1', 'left_ear'], ['Ear2', 'right_ear'],
  ['Body', 'body'], ['Hands', 'hands'], ['Ring1', 'left_ring'], ['Ring2', 'right_ring'],
  ['Back', 'back'], ['Waist', 'waist'], ['Legs', 'legs'], ['Feet', 'feet'],
]

// Double-quoted Lua string for item names: collapse newlines, escape backslash then double-quote.
function luaName(name: string): string {
  const clean = name.replace(/\r\n|[\r\n]/g, ' ')
  return `"${clean.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

// Single-quoted Lua string for augments: collapse newlines, escape backslash then apostrophe.
// Embedded double quotes are left as-is (valid inside single quotes).
function luaAugment(aug: string): string {
  const clean = aug.replace(/\r\n|[\r\n]/g, ' ')
  return `'${clean.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function slotValue(slot: GearSetSlot): string {
  if (slot.augments.length === 0) return luaName(slot.itemName)
  const augs = slot.augments.map(luaAugment).join(',') + ','
  return `{ name=${luaName(slot.itemName)}, augments={${augs}}}`
}

const LUA_KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto',
  'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while',
])

function setHeader(name: string): string {
  return /^[A-Za-z_]\w*$/.test(name) && !LUA_KEYWORDS.has(name)
    ? `sets.${name}`
    : `sets['${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`
}

export function toGearSwapLua(name: string, slots: GearSetSlot[]): string {
  const bySlot = new Map(slots.map(s => [s.slot, s]))
  const lines: string[] = []
  for (const [grid, key] of SLOT_TO_GEARSWAP) {
    const s = bySlot.get(grid)
    if (!s || s.itemId === 0 || !s.itemName) continue
    lines.push(`    ${key}=${slotValue(s)},`)
  }
  return `${setHeader(name)} = {\n${lines.join('\n')}\n}`
}
