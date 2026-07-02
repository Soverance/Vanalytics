import { describe, it, expect } from 'vitest'
import { resolveDefaultServer } from './economyServers'
import type { EconomyServer } from '../types/api'

const servers: EconomyServer[] = [
  { id: 1, name: 'Asura' },
  { id: 2, name: 'Siren' },
]

describe('resolveDefaultServer', () => {
  it('picks the user default when it is an enabled world', () => {
    expect(resolveDefaultServer(servers, 'Siren')).toBe('Siren')
  })

  it('falls back to the first enabled world when the default is not enabled', () => {
    expect(resolveDefaultServer(servers, 'Bahamut')).toBe('Asura')
  })

  it('falls back to the first enabled world when there is no default', () => {
    expect(resolveDefaultServer(servers, null)).toBe('Asura')
    expect(resolveDefaultServer(servers, undefined)).toBe('Asura')
  })

  it('returns null when no world is enabled', () => {
    expect(resolveDefaultServer([], 'Siren')).toBeNull()
  })
})
