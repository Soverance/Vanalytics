import { describe, it, expect } from 'vitest'
import { jobBitmask, FFXI_JOBS } from './jobs'

describe('jobBitmask', () => {
  it('maps WAR to bit 1 (matches the backend GameItem.Jobs convention)', () => {
    expect(jobBitmask('WAR')).toBe(1 << 1) // 2
  })

  it('maps THF to bit 6', () => {
    expect(jobBitmask('THF')).toBe(1 << 6) // 64
  })

  it('maps RUN (the last job) to bit 22', () => {
    expect(jobBitmask('RUN')).toBe(1 << 22) // 4194304
  })

  it('returns 0 for an unknown job', () => {
    expect(jobBitmask('XYZ')).toBe(0)
  })

  it('covers all 22 jobs with distinct, non-zero bits', () => {
    const bits = FFXI_JOBS.map(jobBitmask)
    expect(new Set(bits).size).toBe(22)
    expect(bits.every(b => b > 0)).toBe(true)
  })
})
