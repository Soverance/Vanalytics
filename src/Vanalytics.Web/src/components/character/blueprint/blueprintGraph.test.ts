import { describe, it, expect } from 'vitest'
import { wouldCreateCycle, TRIGGER_DEFS, categoryOfHandle, actionCatalog, hasAction, allowGenericForHandle, labelForAction, isTerminalHandle, addMember, removeMember, moveMember, cloneSelection, pasteClone, clipboardAnchor, addOverlay, removeOverlay, moveOverlay, isFullSet, canConnect, isConditionType, condFace, statResourceLabel, isValidConnection, isSingleTargetSource, upstreamChainEdgeIds, dropDuplicateTriggers, handleType, handleInfo } from './blueprintGraph'
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

describe('clipboardAnchor', () => {
  it('returns the min-x/min-y corner of the clipboard nodes', () => {
    const clip = {
      nodes: [
        { id: 'a', type: 'equip', position: { x: 30, y: 80 }, data: {} },
        { id: 'b', type: 'mode', position: { x: 10, y: 120 }, data: {} },
      ],
      edges: [],
    }
    expect(clipboardAnchor(clip)).toEqual({ x: 10, y: 80 })
  })

  it('returns the single node position for a one-node clipboard', () => {
    const clip = { nodes: [{ id: 'a', type: 'equip', position: { x: 42, y: 7 }, data: {} }], edges: [] }
    expect(clipboardAnchor(clip)).toEqual({ x: 42, y: 7 })
  })

  it('returns {0,0} for an empty clipboard', () => {
    expect(clipboardAnchor({ nodes: [], edges: [] })).toEqual({ x: 0, y: 0 })
  })
})

describe('overlay list helpers', () => {
  it('adds, removes, and reorders overlay set ids immutably', () => {
    let c = addOverlay([], 10)
    c = addOverlay(c, 11)
    expect(c).toEqual([10, 11])
    expect(moveOverlay(c, 1, -1)).toEqual([11, 10])
    expect(moveOverlay(c, 1, 1)).toEqual([10, 11])   // out of range -> unchanged
    expect(removeOverlay(c, 0)).toEqual([11])
  })
})

describe('isFullSet', () => {
  it('is true only when all 16 slots are filled', () => {
    expect(isFullSet(16)).toBe(true)
    expect(isFullSet(15)).toBe(false)
    expect(isFullSet(0)).toBe(false)
  })
})

describe('canConnect', () => {
  it('lets terminal pins reach equip and mode; blocks category pins from mode', () => {
    expect(canConnect('trigger:status_change', 'Engaged', 'equip')).toBe(true)
    expect(canConnect('trigger:status_change', 'Engaged', 'mode')).toBe(true)
    expect(canConnect('trigger:precast', 'WeaponSkill', 'mode')).toBe(false)
    expect(canConnect('trigger:precast', 'WeaponSkill', 'equip')).toBe(true)
  })
})

describe('condition helpers', () => {
  it('identifies condition node types', () => {
    expect(isConditionType('cond:buff')).toBe(true)
    expect(isConditionType('cond:stat')).toBe(true)
    expect(isConditionType('branch')).toBe(false)
    expect(isConditionType('equip')).toBe(false)
  })

  it('builds a node face for stat and buff', () => {
    expect(statResourceLabel('hpp')).toBe('HP%')
    expect(condFace('cond:stat', { resource: 'hpp', op: '<', value: 25 })).toBe('HP% < 25')
    expect(condFace('cond:buff', { buffName: 'Sneak Attack' })).toBe('Sneak Attack')
    expect(condFace('cond:buff', { buffName: null })).toMatch(/pick/i)
  })

  it('validates condition wires only into a branch cond input', () => {
    expect(isValidConnection('cond:buff', 'out', 'branch', 'cond')).toBe(true)
    expect(isValidConnection('cond:buff', 'out', 'equip', 'cond')).toBe(false)
    expect(isValidConnection('cond:buff', 'out', 'branch', 'in')).toBe(false)
  })

  it('validates exec wires from trigger/branch into branch|equip|mode', () => {
    expect(isValidConnection('trigger:status_change', 'Idle', 'branch', 'in')).toBe(true)
    expect(isValidConnection('trigger:status_change', 'Idle', 'mode', 'in')).toBe(true)
    expect(isValidConnection('trigger:precast', 'WeaponSkill', 'branch', 'in')).toBe(true)
    expect(isValidConnection('trigger:precast', 'WeaponSkill', 'mode', 'in')).toBe(false)
    expect(isValidConnection('branch', 'true', 'equip', 'in')).toBe(true)
    expect(isValidConnection('branch', 'false', 'branch', 'in')).toBe(true)
  })

  it('knows which sources are single-target', () => {
    expect(isSingleTargetSource('trigger:status_change', 'Idle')).toBe(true)
    expect(isSingleTargetSource('trigger:precast', 'WeaponSkill')).toBe(false)
    expect(isSingleTargetSource('branch', 'true')).toBe(true)
    expect(isSingleTargetSource('cond:buff', 'out')).toBe(false)
  })

  it('branch keeps its exec input when a condition input is added (handle-aware dedup)', () => {
    expect(isSingleTargetSource('cond:buff', 'out')).toBe(false)
    expect(isValidConnection('trigger:status_change', 'Idle', 'branch', 'in')).toBe(true)
    expect(isValidConnection('cond:buff', 'out', 'branch', 'cond')).toBe(true)
  })

  it('collects only the upstream exec lineage of a node (directed, stops at triggers, skips cond + downstream)', () => {
    const edges = [
      { id: 't-b', source: 'trig', target: 'branch', targetHandle: 'in' },     // trigger -> branch (exec)
      { id: 'b-e', source: 'branch', target: 'equip', targetHandle: 'in' },     // branch -> selected leaf
      { id: 'c-b', source: 'cond', target: 'branch', targetHandle: 'cond' },    // condition feeder (excluded)
      { id: 'b-e2', source: 'branch', target: 'equip2', targetHandle: 'in' },   // sibling leaf (downstream, excluded)
      { id: 'far', source: 'x', target: 'y', targetHandle: 'in' },              // unrelated component
    ]
    // From the leaf: walk up through the branch to the trigger; skip the cond feeder, the sibling
    // leaf, and the unrelated edge.
    expect(upstreamChainEdgeIds(edges, 'equip')).toEqual(new Set(['b-e', 't-b']))
    // A trigger has nothing upstream.
    expect(upstreamChainEdgeIds(edges, 'trig')).toEqual(new Set())
  })

  it('dropDuplicateTriggers removes pasted triggers whose type already exists, plus their edges', () => {
    const nodes = [
      { id: 'p', type: 'trigger:precast' },   // duplicate -> dropped
      { id: 'b', type: 'branch' },
      { id: 'e', type: 'equip' },
    ]
    const edges = [
      { source: 'p', target: 'b' },   // touches dropped 'p' -> dropped
      { source: 'b', target: 'e' },   // survives
    ]
    const out = dropDuplicateTriggers(nodes, edges, new Set(['trigger:precast']))
    expect(out.nodes.map(n => n.id)).toEqual(['b', 'e'])
    expect(out.edges).toEqual([{ source: 'b', target: 'e' }])
  })

  it('dropDuplicateTriggers keeps a pasted trigger whose type is not yet on the canvas', () => {
    const out = dropDuplicateTriggers(
      [{ id: 'a', type: 'trigger:aftercast' }], [], new Set(['trigger:precast']))
    expect(out.nodes.map(n => n.id)).toEqual(['a'])
    expect(out.edges).toEqual([])
  })
})

describe('handle type inventory', () => {
  it('resolves value types for existing node handles', () => {
    expect(handleType('trigger:precast', 'Magic')).toBe('exec')
    expect(handleType('trigger:status_change', 'Engaged')).toBe('exec')
    expect(handleType('branch', 'in')).toBe('exec')
    expect(handleType('branch', 'true')).toBe('exec')
    expect(handleType('branch', 'false')).toBe('exec')
    expect(handleType('branch', 'cond')).toBe('bool')
    expect(handleType('equip', 'in')).toBe('exec')
    expect(handleType('mode', 'in')).toBe('exec')
    expect(handleType('cond:buff', 'out')).toBe('bool')
    expect(handleType('cond:stat', 'out')).toBe('bool')
  })

  it('returns null for unknown handles or nodes', () => {
    expect(handleType('branch', 'nope')).toBeNull()
    expect(handleType('equip', null)).toBeNull()
    expect(handleType('does-not-exist', 'in')).toBeNull()
  })

  it('handleInfo carries direction', () => {
    expect(handleInfo('branch', 'cond')).toEqual({ id: 'cond', type: 'bool', dir: 'in' })
    expect(handleInfo('branch', 'true')).toEqual({ id: 'true', type: 'exec', dir: 'out' })
    expect(handleInfo('trigger:precast', 'Magic')).toEqual({ id: 'Magic', type: 'exec', dir: 'out' })
  })
})
