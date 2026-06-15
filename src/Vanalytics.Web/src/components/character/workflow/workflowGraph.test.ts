import { describe, it, expect } from 'vitest'
import { wouldCreateCycle, TRIGGER_DEFS, categoryOfHandle, actionCatalog, hasAction, allowGenericForHandle, labelForAction } from './workflowGraph'
import type { WorkflowEdge, WorkflowNode } from '../../../types/api'

describe('wouldCreateCycle', () => {
  const edges: WorkflowEdge[] = [
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
    const nodes: WorkflowNode[] = [
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
