import { describe, it, expect } from 'vitest'
import type { AdminUser } from '../types/api'
import {
  signupSeries, activityBreakdown, authBreakdown, roleBreakdown,
  characterHistogram, topServers, userSummary,
} from './adminUserAnalytics'

function u(over: Partial<AdminUser>): AdminUser {
  return {
    id: crypto.randomUUID(), email: 'a@b.com', username: 'user', displayName: null,
    role: 'Member', isSystemAccount: false, hasApiKey: false, hasPassword: true,
    oAuthProvider: null, characterCount: 0,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    lastActiveAt: null, defaultServer: null, ...over,
  }
}

const NOW = new Date('2026-07-11T00:00:00Z')

describe('signupSeries', () => {
  it('buckets by month, ascending, with running cumulative', () => {
    const users = [
      u({ createdAt: '2026-01-10T00:00:00Z' }),
      u({ createdAt: '2026-01-20T00:00:00Z' }),
      u({ createdAt: '2026-03-05T00:00:00Z' }),
    ]
    const s = signupSeries(users, 'month')
    expect(s.map(p => p.period)).toEqual(['2026-01', '2026-03'])
    expect(s.map(p => p.created)).toEqual([2, 1])
    expect(s.map(p => p.cumulative)).toEqual([2, 3])
  })
})

describe('activityBreakdown', () => {
  it('places each user in exactly one of the five buckets', () => {
    const users = [
      u({ lastActiveAt: '2026-07-09T00:00:00Z' }), // 2d -> active7
      u({ lastActiveAt: '2026-06-25T00:00:00Z' }), // ~16d -> active30
      u({ lastActiveAt: '2026-05-15T00:00:00Z' }), // ~57d -> active90
      u({ lastActiveAt: '2026-01-01T00:00:00Z' }), // >90d -> dormant
      u({ lastActiveAt: null }),                    // never
    ]
    const counts = Object.fromEntries(activityBreakdown(users, NOW).map(c => [c.key, c.count]))
    expect(counts).toEqual({ active7: 1, active30: 1, active90: 1, dormant: 1, never: 1 })
  })
})

describe('authBreakdown / roleBreakdown', () => {
  it('counts auth providers with local for null, sorted desc', () => {
    const users = [u({}), u({}), u({ oAuthProvider: 'google' })]
    expect(authBreakdown(users)).toEqual([
      { key: 'local', label: 'Local', count: 2 },
      { key: 'google', label: 'Google', count: 1 },
    ])
  })
  it('counts roles in fixed order, omitting empty roles', () => {
    const users = [u({ role: 'Admin' }), u({ role: 'Member' }), u({ role: 'Member' })]
    expect(roleBreakdown(users)).toEqual([
      { key: 'Member', label: 'Member', count: 2 },
      { key: 'Admin', label: 'Admin', count: 1 },
    ])
  })
})

describe('characterHistogram / topServers', () => {
  it('bins character counts with a 5+ overflow bucket', () => {
    const users = [u({ characterCount: 0 }), u({ characterCount: 2 }), u({ characterCount: 7 })]
    const counts = Object.fromEntries(characterHistogram(users).map(c => [c.key, c.count]))
    expect(counts).toEqual({ '0': 1, '1': 0, '2': 1, '3': 0, '4': 0, '5+': 1 })
  })
  it('ranks servers by user count, ignoring null', () => {
    const users = [u({ defaultServer: 'Asura' }), u({ defaultServer: 'Asura' }), u({ defaultServer: 'Bahamut' }), u({ defaultServer: null })]
    expect(topServers(users)).toEqual([
      { key: 'Asura', label: 'Asura', count: 2 },
      { key: 'Bahamut', label: 'Bahamut', count: 1 },
    ])
  })
})

describe('userSummary', () => {
  it('computes total, active30, newThisMonth, avgCharacters', () => {
    const users = [
      u({ createdAt: '2026-07-02T00:00:00Z', lastActiveAt: '2026-07-10T00:00:00Z', characterCount: 4 }),
      u({ createdAt: '2026-02-01T00:00:00Z', lastActiveAt: null, characterCount: 0 }),
    ]
    expect(userSummary(users, NOW)).toEqual({ total: 2, active30: 1, newThisMonth: 1, avgCharacters: 2 })
  })
})
