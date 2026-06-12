import { describe, it, expect } from 'vitest'
import { toGearSwapLua, type GearSetSlot } from './gearSwapExport'

const slot = (s: string, itemName: string, augments: string[] = []): GearSetSlot =>
  ({ slot: s, itemId: 1, itemName, augments })

describe('toGearSwapLua', () => {
  it('emits a bare string for an un-augmented slot', () => {
    const lua = toGearSwapLua('WS', [slot('Head', 'Pill. Bonnet +1')])
    expect(lua).toContain('sets.WS = {')
    expect(lua).toContain('    head="Pill. Bonnet +1",')
  })

  it('maps ear/ring slots to GearSwap left/right keys', () => {
    const lua = toGearSwapLua('X', [
      slot('Ear1', 'A'), slot('Ear2', 'B'), slot('Ring1', 'C'), slot('Ring2', 'D'),
    ])
    expect(lua).toContain('left_ear="A"')
    expect(lua).toContain('right_ear="B"')
    expect(lua).toContain('left_ring="C"')
    expect(lua).toContain('right_ring="D"')
  })

  it('emits a name+augments table for an augmented slot', () => {
    const lua = toGearSwapLua('WS', [
      slot('Legs', 'Plun. Culottes +1', ['Enhances "Feint" effect']),
    ])
    expect(lua).toContain(
      `    legs={ name="Plun. Culottes +1", augments={'Enhances "Feint" effect',}},`)
  })

  it('keeps embedded double quotes in augments as-is', () => {
    const lua = toGearSwapLua('X', [slot('Ammo', 'Y', ['"Dual Wield"+3'])])
    expect(lua).toContain(`augments={'"Dual Wield"+3',}`)
  })

  it("escapes an apostrophe inside a single-quoted augment", () => {
    const lua = toGearSwapLua('X', [
      slot('Feet', 'Plun. Poulaines +1', ['Enhances "Assassin\'s Charge" effect']),
    ])
    expect(lua).toContain(`augments={'Enhances "Assassin\\'s Charge" effect',}`)
  })

  it('joins multiple augments with commas and a trailing comma', () => {
    const lua = toGearSwapLua('X', [slot('Back', 'Cape', ['DEX+9', 'DEX+2'])])
    expect(lua).toContain(`augments={'DEX+9','DEX+2',}`)
  })

  it('omits empty slots entirely', () => {
    const lua = toGearSwapLua('X', [slot('Main', 'Sword'), { slot: 'Sub', itemId: 0, itemName: '', augments: [] }])
    expect(lua).toContain('main="Sword"')
    expect(lua).not.toContain('sub=')
  })

  it('uses bracket form for names that are not valid Lua identifiers', () => {
    const lua = toGearSwapLua('My TP Set', [slot('Main', 'Sword')])
    expect(lua).toContain("sets['My TP Set'] = {")
  })

  it('orders slots in canonical equip order regardless of input order', () => {
    const lua = toGearSwapLua('X', [slot('Feet', 'F'), slot('Main', 'M'), slot('Head', 'H')])
    const mainIdx = lua.indexOf('main=')
    const headIdx = lua.indexOf('head=')
    const feetIdx = lua.indexOf('feet=')
    expect(mainIdx).toBeLessThan(headIdx)
    expect(headIdx).toBeLessThan(feetIdx)
  })

  it('escapes a backslash in an item name', () => {
    const lua = toGearSwapLua('X', [slot('Main', 'Foo\\Bar')])
    expect(lua).toContain('main="Foo\\\\Bar"')
  })

  it('escapes a backslash in an augment', () => {
    const lua = toGearSwapLua('X', [slot('Back', 'Cape', ['STR+5\\+1'])])
    expect(lua).toContain(`augments={'STR+5\\\\+1',}`)
  })

  it('escapes an apostrophe in a bracketed set name', () => {
    const lua = toGearSwapLua("O'clock", [slot('Main', 'Sword')])
    expect(lua).toContain("sets['O\\'clock'] = {")
  })

  it('uses bracket form for Lua reserved-word set names', () => {
    const lua = toGearSwapLua('end', [slot('Main', 'Sword')])
    expect(lua).toContain("sets['end'] = {")
    expect(lua).not.toContain('sets.end')
  })

  it('collapses newlines in augments to keep the Lua string on one line', () => {
    const lua = toGearSwapLua('X', [slot('Back', 'Cape', ['STR+5\nDEX+3'])])
    expect(lua).toContain(`augments={'STR+5 DEX+3',}`)
  })
})
