import { describe, it, expect } from 'vitest'
import { listWarps, TELEPOINTS } from './warps'

describe('listWarps', () => {
  it('marks every catalog entry obtained when all IDs are present, preserving catalog order', () => {
    const allIds = TELEPOINTS.map(e => e.id)
    const rows = listWarps('telepoints', allIds)
    expect(rows).toHaveLength(TELEPOINTS.length)
    expect(rows.every(r => r.obtained)).toBe(true)
    expect(rows[0].entry.name).toBe('Holla gate crystal')
  })

  it('splits obtained vs missing per catalog ID', () => {
    const rows = listWarps('telepoints', [0, 2])
    expect(rows).toHaveLength(TELEPOINTS.length)
    expect(rows.find(r => r.entry.id === 0)!.obtained).toBe(true)
    expect(rows.find(r => r.entry.id === 1)!.obtained).toBe(false)
    expect(rows.find(r => r.entry.id === 2)!.obtained).toBe(true)
  })

  it('marks all entries missing when nothing is obtained', () => {
    const rows = listWarps('telepoints', [])
    expect(rows).toHaveLength(TELEPOINTS.length)
    expect(rows.every(r => !r.obtained)).toBe(true)
  })

  it('appends obtained IDs with no catalog entry as trailing obtained rows', () => {
    const rows = listWarps('telepoints', [9])
    expect(rows).toHaveLength(TELEPOINTS.length + 1)
    const last = rows[rows.length - 1]
    expect(last.entry.id).toBe(9)
    expect(last.entry.name).toBe('Telepoint #9')
    expect(last.obtained).toBe(true)
    expect(rows.slice(0, TELEPOINTS.length).every(r => !r.obtained)).toBe(true)
  })

  it('dedupes repeated unmapped obtained IDs into a single trailing row', () => {
    const rows = listWarps('telepoints', [9, 9])
    const unmapped = rows.filter(r => r.entry.id === 9)
    expect(unmapped).toHaveLength(1)
    expect(rows).toHaveLength(TELEPOINTS.length + 1)
  })

  it('appends multiple unmapped IDs in first-seen order', () => {
    const rows = listWarps('telepoints', [10, 9])
    const trailing = rows.slice(TELEPOINTS.length)
    expect(trailing.map(r => r.entry.id)).toEqual([10, 9])
  })
})
