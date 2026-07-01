import { describe, it, expect } from 'vitest'
import { SPAN_OPTIONS, spanLabel } from './economySpans'

describe('SPAN_OPTIONS', () => {
  it('offers 30d/90d/1y/All encoded as 30/90/365/0', () => {
    expect(SPAN_OPTIONS.map(o => o.value)).toEqual([30, 90, 365, 0])
    expect(SPAN_OPTIONS.map(o => o.label)).toEqual(['30d', '90d', '1y', 'All'])
  })
})

describe('spanLabel', () => {
  it('labels all-time as "All Time"', () => {
    expect(spanLabel(0)).toBe('All Time')
  })
  it('labels known spans with their short label', () => {
    expect(spanLabel(30)).toBe('30d')
    expect(spanLabel(90)).toBe('90d')
    expect(spanLabel(365)).toBe('1y')
  })
  it('falls back to Nd for an unknown span', () => {
    expect(spanLabel(45)).toBe('45d')
  })
})
