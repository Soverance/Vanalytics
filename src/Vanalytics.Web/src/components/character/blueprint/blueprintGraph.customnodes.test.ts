import { describe, it, expect } from 'vitest'
import {
  handlesOf, handleType, isSingleTargetSource, isValidConnection,
  CHAT_COLORS, DEFAULT_CHAT_COLOR, printFace, luaFace, setupFace, dropDuplicateSingletons,
} from './blueprintGraph'

describe('custom node handles', () => {
  it('setup has no handles (standalone)', () => {
    expect(handlesOf('setup')).toHaveLength(0)
  })
  it('lua and print are exec in/out', () => {
    expect(handleType('lua', 'in')).toBe('exec')
    expect(handleType('lua', 'out')).toBe('exec')
    expect(handleType('print', 'in')).toBe('exec')
    expect(handleType('print', 'out')).toBe('exec')
  })
  it('equip and mode gain an exec out', () => {
    expect(handleType('equip', 'out')).toBe('exec')
    expect(handleType('mode', 'out')).toBe('exec')
  })
  it('exec out of equip/mode/lua/print is single-target', () => {
    expect(isSingleTargetSource('equip', 'out')).toBe(true)
    expect(isSingleTargetSource('mode', 'out')).toBe(true)
    expect(isSingleTargetSource('lua', 'out')).toBe(true)
    expect(isSingleTargetSource('print', 'out')).toBe(true)
  })
  it('an exec node out connects to a lua/print in', () => {
    expect(isValidConnection('equip', 'out', 'print', 'in')).toBe(true)
    expect(isValidConnection('print', 'out', 'equip', 'in')).toBe(true)
    expect(isValidConnection('lua', 'out', 'branch', 'in')).toBe(true)
  })
  it('a category trigger pin cannot reach a lua/print directly', () => {
    expect(isValidConnection('trigger:precast', 'WeaponSkill', 'print', 'in')).toBe(false)
    expect(isValidConnection('trigger:precast', 'WeaponSkill', 'lua', 'in')).toBe(false)
  })
})

describe('print/lua/setup faces + colors', () => {
  it('default color exists in the palette', () => {
    expect(CHAT_COLORS.some(c => c.code === DEFAULT_CHAT_COLOR)).toBe(true)
  })
  it('faces show content or a placeholder', () => {
    expect(printFace({ chatText: 'Hi' })).toContain('Hi')
    expect(printFace({ chatText: '' })).toBe('say…')
    expect(luaFace({ code: 'send_command("x")\nmore()' })).toContain('send_command')
    expect(setupFace({ code: '' })).toBe('file-load setup…')
  })
})

describe('singleton drop', () => {
  it('drops a pasted duplicate setup but keeps the rest', () => {
    const nodes = [{ id: 'a', type: 'setup' }, { id: 'b', type: 'equip' }]
    const edges = [{ source: 'a', target: 'b' }]
    const out = dropDuplicateSingletons(nodes, edges, new Set(['setup']))
    expect(out.nodes.map(n => n.id)).toEqual(['b'])
    expect(out.edges).toHaveLength(0)
  })
})
