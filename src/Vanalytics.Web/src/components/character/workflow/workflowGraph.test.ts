import { describe, it, expect } from 'vitest'
import { wouldCreateCycle, TRIGGER_DEFS } from './workflowGraph'
import type { WorkflowEdge } from '../../../types/api'

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
})
