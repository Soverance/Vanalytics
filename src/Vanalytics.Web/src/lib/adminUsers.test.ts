import { describe, it, expect } from 'vitest'
import type { AdminUser } from '../types/api'
import { authTypeOf, filterUsers, sortUsers } from './adminUsers'

function u(over: Partial<AdminUser>): AdminUser {
  return {
    id: crypto.randomUUID(),
    email: 'a@b.com',
    username: 'user',
    displayName: null,
    role: 'Member',
    isSystemAccount: false,
    hasApiKey: false,
    hasPassword: true,
    oAuthProvider: null,
    characterCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    lastActiveAt: null,
    defaultServer: null,
    ...over,
  }
}

describe('authTypeOf', () => {
  it('returns local for null provider', () => {
    expect(authTypeOf(u({ oAuthProvider: null }))).toBe('local')
  })
  it('lowercases the provider', () => {
    expect(authTypeOf(u({ oAuthProvider: 'Google' }))).toBe('google')
  })
})

describe('filterUsers', () => {
  const users = [
    u({ username: 'alice', email: 'alice@x.com', role: 'Admin', oAuthProvider: 'google' }),
    u({ username: 'bob', displayName: 'Bobby', email: 'bob@x.com', role: 'Member' }),
  ]
  const base = { search: '', role: 'all' as const, auth: 'all' as const }

  it('matches search across username, displayName, email (case-insensitive)', () => {
    expect(filterUsers(users, { ...base, search: 'BOBBY' })).toHaveLength(1)
    expect(filterUsers(users, { ...base, search: 'alice@' })).toHaveLength(1)
  })
  it('filters by role', () => {
    expect(filterUsers(users, { ...base, role: 'Admin' }).map(x => x.username)).toEqual(['alice'])
  })
  it('filters by auth type (local = null provider)', () => {
    expect(filterUsers(users, { ...base, auth: 'local' }).map(x => x.username)).toEqual(['bob'])
  })
  it('composes all three predicates', () => {
    expect(filterUsers(users, { search: 'x.com', role: 'Admin', auth: 'google' })).toHaveLength(1)
  })
})

describe('sortUsers', () => {
  const a = u({ username: 'aaa', characterCount: 1, lastActiveAt: '2026-01-05T00:00:00Z' })
  const b = u({ username: 'bbb', characterCount: 3, lastActiveAt: null })
  const users = [b, a]

  it('sorts by characterCount ascending', () => {
    expect(sortUsers(users, 'characterCount', 'asc').map(x => x.username)).toEqual(['aaa', 'bbb'])
  })
  it('sorts by username descending', () => {
    expect(sortUsers(users, 'username', 'desc').map(x => x.username)).toEqual(['bbb', 'aaa'])
  })
  it('treats null lastActiveAt as oldest', () => {
    expect(sortUsers(users, 'lastActiveAt', 'desc').map(x => x.username)).toEqual(['aaa', 'bbb'])
  })
  it('does not mutate the input array', () => {
    const copy = [...users]
    sortUsers(users, 'username', 'asc')
    expect(users).toEqual(copy)
  })
})
