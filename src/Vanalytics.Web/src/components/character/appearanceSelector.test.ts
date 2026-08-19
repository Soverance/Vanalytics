import { describe, expect, it } from 'vitest'
import { genderOptions, stepFace, isDefaultAppearance, formatFaceLabel } from './appearanceSelector'

describe('genderOptions', () => {
  it('returns both genders for dual-gender races', () => {
    expect(genderOptions('Tarutaru')).toEqual(['Male', 'Female'])
    expect(genderOptions('Hume')).toEqual(['Male', 'Female'])
    expect(genderOptions('Elvaan')).toEqual(['Male', 'Female'])
  })
  it('returns the single gender for single-gender races', () => {
    expect(genderOptions('Mithra')).toEqual(['Female'])
    expect(genderOptions('Galka')).toEqual(['Male'])
  })
  it('returns empty for unknown/missing race', () => {
    expect(genderOptions(undefined)).toEqual([])
    expect(genderOptions('Zilart')).toEqual([])
  })
})

describe('stepFace', () => {
  it('steps forward and back', () => {
    expect(stepFace(0, 1, 16)).toBe(1)
    expect(stepFace(5, -1, 16)).toBe(4)
  })
  it('wraps around both ends', () => {
    expect(stepFace(15, 1, 16)).toBe(0)
    expect(stepFace(0, -1, 16)).toBe(15)
  })
  it('is safe with zero count', () => {
    expect(stepFace(0, 1, 0)).toBe(0)
  })
})

describe('isDefaultAppearance', () => {
  it('true only when both fields match', () => {
    const def = { gender: 'Male', faceModelId: 0 }
    expect(isDefaultAppearance({ gender: 'Male', faceModelId: 0 }, def)).toBe(true)
    expect(isDefaultAppearance({ gender: 'Female', faceModelId: 0 }, def)).toBe(false)
    expect(isDefaultAppearance({ gender: 'Male', faceModelId: 3 }, def)).toBe(false)
  })
})

describe('formatFaceLabel', () => {
  it('formats face-paths names like F1A', () => {
    expect(formatFaceLabel('F1A')).toBe('Face 1A')
    expect(formatFaceLabel('F8B')).toBe('Face 8B')
  })
  it('passes through unrecognized names', () => {
    expect(formatFaceLabel('special')).toBe('special')
  })
})
