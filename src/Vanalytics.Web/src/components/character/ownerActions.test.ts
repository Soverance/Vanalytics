import { describe, it, expect } from 'vitest'
import { ownerDisplayLabel, shouldShowMessageButton } from './ownerActions'
import type { CharacterOwner } from '../../types/api'

const base: CharacterOwner = {
  ownerUserId: 'u1',
  ownerUsername: 'scott',
  ownerDisplayName: 'Scott',
  ownerAvatarUrl: null,
  canMessage: true,
}

describe('ownerDisplayLabel', () => {
  it('uses displayName when present', () => {
    expect(ownerDisplayLabel(base)).toBe('Scott')
  })

  it('falls back to username when displayName is null', () => {
    expect(ownerDisplayLabel({ ...base, ownerDisplayName: null })).toBe('scott')
  })
})

describe('shouldShowMessageButton', () => {
  it('is true when canMessage is true', () => {
    expect(shouldShowMessageButton(base)).toBe(true)
  })

  it('is false when canMessage is false', () => {
    expect(shouldShowMessageButton({ ...base, canMessage: false })).toBe(false)
  })

  it('is false when owner is null', () => {
    expect(shouldShowMessageButton(null)).toBe(false)
  })
})
