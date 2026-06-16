import { describe, it, expect } from 'vitest'
import { wouldCreateCycle, TRIGGER_DEFS, categoryOfHandle, actionCatalog, hasAction, allowGenericForHandle, labelForAction, isTerminalHandle, addMember, removeMember, moveMember, cloneSelection, pasteClone } from './blueprintGraph'
import type { BlueprintEdge, BlueprintNode } from '../../../types/api'

describe('wouldCreateCycle', () => {
  const edges: BlueprintEdge[] = [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'c' },
  ]

  it('detects a back-edge that closes a loop', () => {
    expect(wouldCreateCycle(edges, 'c', 'a')).toBe(true)
  })

  it('allows a forward edge', () => {
    expect(wouldCreateCycle(edges, 'a', 'c')).toBe(false)
  })

  it('treats a self-edge as a cycle', () => {
    expect(wouldCreateCycle(edges, 'a', 'a')).toBe(true)
  })
})

describe('TRIGGER_DEFS', () => {
  it('defines branch handles for each trigger', () => {
    expect(TRIGGER_DEFS['trigger:status_change'].handles).toEqual(['Engaged', 'Idle', 'Resting'])
    expect(TRIGGER_DEFS['trigger:precast'].handles).toEqual(['WeaponSkill', 'JobAbility', 'Magic'])
    expect(TRIGGER_DEFS['trigger:aftercast'].handles).toEqual(['Engaged', 'Idle'])
  })

  it('defines handles for midcast and buff_change', () => {
    expect(TRIGGER_DEFS['trigger:midcast'].handles).toEqual(['Magic', 'Ranged'])
    expect(TRIGGER_DEFS['trigger:buff_change'].handles).toEqual(['Gained', 'Lost'])
  })
})

describe('action helpers', () => {
  it('maps precast handles to a category, terminal handles to null', () => {
    expect(categoryOfHandle('trigger:precast', 'WeaponSkill')).toBe('WeaponSkill')
    expect(categoryOfHandle('trigger:precast', 'Magic')).toBe('Magic')
    expect(categoryOfHandle('trigger:status_change', 'Engaged')).toBeNull()
    expect(categoryOfHandle('trigger:aftercast', 'Idle')).toBeNull()
  })

  it('returns a catalog for each category with known entries', () => {
    const ws = actionCatalog('WeaponSkill')
    expect(ws.length).toBeGreaterThan(100)
    expect(ws.find(a => a.name === 'Mercy Stroke')).toBeTruthy()
    expect(actionCatalog('JobAbility').find(a => a.name === 'Sneak Attack')).toBeTruthy()
    expect(actionCatalog('Magic').length).toBeGreaterThan(100)
  })

  it('detects an already-added action on a pin', () => {
    const nodes: BlueprintNode[] = [
      { id: 'leaf', type: 'equip', position: { x: 0, y: 0 }, data: { actionName: 'Mercy Stroke' } },
    ]
    const edges = [{ id: 'e', source: 't', sourceHandle: 'WeaponSkill', target: 'leaf', targetHandle: 'in' }]
    expect(hasAction(nodes, edges, 't', 'WeaponSkill', 'Mercy Stroke')).toBe(true)
    expect(hasAction(nodes, edges, 't', 'WeaponSkill', "Rudra's Storm")).toBe(false)
  })

  it('categorizes the new pins', () => {
    expect(categoryOfHandle('trigger:midcast', 'Magic')).toBe('Magic')
    expect(categoryOfHandle('trigger:midcast', 'Ranged')).toBeNull()
    expect(categoryOfHandle('trigger:buff_change', 'Gained')).toBe('Buff')
    expect(categoryOfHandle('trigger:buff_change', 'Lost')).toBe('Buff')
  })

  it('reports allowGeneric per pin', () => {
    expect(allowGenericForHandle('trigger:midcast', 'Magic')).toBe(true)
    expect(allowGenericForHandle('trigger:buff_change', 'Gained')).toBe(false)
    expect(allowGenericForHandle('trigger:status_change', 'Engaged')).toBe(false)
  })

  it('Buff catalog uses raw en with Title-Case labels', () => {
    const buffs = actionCatalog('Buff')
    expect(buffs.length).toBeGreaterThan(100)
    expect(buffs.find(b => b.name === 'doom')?.label).toBe('Doom')
    expect(buffs.find(b => b.name === 'Sneak Attack')?.label).toBe('Sneak Attack')
  })

  it('labelForAction resolves buff labels and passes others through', () => {
    expect(labelForAction('doom')).toBe('Doom')
    expect(labelForAction('Mercy Stroke')).toBe('Mercy Stroke')
    expect(labelForAction(null)).toBe('')
  })
})

describe('mode helpers', () => {
  it('treats terminal handles as mode-targetable, category handles not', () => {
    expect(isTerminalHandle('trigger:status_change', 'Engaged')).toBe(true)
    expect(isTerminalHandle('trigger:aftercast', 'Idle')).toBe(true)
    expect(isTerminalHandle('trigger:precast', 'WeaponSkill')).toBe(false)
    expect(isTerminalHandle('trigger:buff_change', 'Gained')).toBe(false)
  })

  it('adds, reorders, and removes members immutably', () => {
    let m = addMember([], 10)
    m = addMember(m, 11)
    m = addMember(m, 12)
    expect(m.map(x => x.gearSetId)).toEqual([10, 11, 12])
    m = moveMember(m, 0, 1)
    expect(m.map(x => x.gearSetId)).toEqual([11, 10, 12])
    expect(moveMember(m, 0, -1).map(x => x.gearSetId)).toEqual([11, 10, 12]) // no-op at top
    expect(moveMember(m, 2, 1).map(x => x.gearSetId)).toEqual([11, 10, 12])  // no-op at bottom
    m = removeMember(m, 1)
    expect(m.map(x => x.gearSetId)).toEqual([11, 12])
  })
})

describe('copy/paste transforms', () => {
  const nodes = [
    { id: 'a', type: 'equip', selected: true, position: { x: 0, y: 0 }, data: { gearSetId: 1 } },
    { id: 'b', type: 'mode', selected: true, position: { x: 10, y: 10 }, data: { members: [{ gearSetId: 2 }] } },
    { id: 'c', type: 'equip', selected: false, position: { x: 99, y: 99 }, data: { gearSetId: 3 } },
  ]
  const edges = [
    { id: 'a-in-b', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in' }, // internal (a,b both selected)
    { id: 'b-in-c', source: 'b', target: 'c', sourceHandle: 'out', targetHandle: 'in' }, // crosses to unselected c
  ]

  it('cloneSelection keeps only selected nodes + edges internal to them, deep-copying data', () => {
    const clip = cloneSelection(nodes, edges)
    expect(clip.nodes.map(n => n.id)).toEqual(['a', 'b'])
    expect(clip.edges.map(e => e.id)).toEqual(['a-in-b'])           // crossing edge dropped
    ;(clip.nodes[1].data as { members: { gearSetId: number }[] }).members[0].gearSetId = 999
    expect((nodes[1].data as { members: { gearSetId: number }[] }).members[0].gearSetId).toBe(2)
  })

  it('cloneSelection returns empty when nothing is selected', () => {
    const clip = cloneSelection(nodes.map(n => ({ ...n, selected: false })), edges)
    expect(clip.nodes).toEqual([])
    expect(clip.edges).toEqual([])
  })

  it('pasteClone remaps ids consistently, offsets positions, marks selected', () => {
    const clip = cloneSelection(nodes, edges)
    let i = 0
    const newId = () => `new${++i}`
    const out = pasteClone(clip, newId, { x: 40, y: 40 })

    expect(out.nodes.map(n => n.id)).toEqual(['new1', 'new2'])
    expect(out.nodes.every(n => n.selected)).toBe(true)
    expect(out.nodes[0].position).toEqual({ x: 40, y: 40 })
    expect(out.nodes[1].position).toEqual({ x: 50, y: 50 })
    expect(out.edges).toHaveLength(1)
    expect(out.edges[0].source).toBe('new1')
    expect(out.edges[0].target).toBe('new2')
    expect(out.edges[0].selected).toBe(true)
    expect(clip.nodes[0].id).toBe('a')                              // original untouched
  })
})
