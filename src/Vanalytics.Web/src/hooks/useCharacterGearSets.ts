import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { GearSetSummary, GearSetDetail, GearSetSlot } from '../types/api'

interface SaveBody { name: string; job: string | null; category: string; tags: string[]; slots: GearSetSlot[] }

export interface UseCharacterGearSets {
  sets: GearSetSummary[]
  loading: boolean
  error: Error | null
  reload: () => Promise<void>
  getSet: (setId: number) => Promise<GearSetDetail>
  createSet: (body: SaveBody) => Promise<GearSetDetail>
  updateSet: (setId: number, body: SaveBody) => Promise<GearSetDetail>
  deleteSet: (setId: number) => Promise<void>
}

export function useCharacterGearSets(characterId: string): UseCharacterGearSets {
  const [sets, setSets] = useState<GearSetSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<GearSetSummary[]>(`/api/characters/${characterId}/gear-sets`)
      setSets(data ?? [])
      setError(null)
    } catch (e: unknown) {
      setSets([])
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [characterId])

  useEffect(() => { reload() }, [reload])

  const getSet = useCallback(
    (setId: number) => api<GearSetDetail>(`/api/characters/${characterId}/gear-sets/${setId}`),
    [characterId])

  const createSet = useCallback(async (body: SaveBody) => {
    const created = await api<GearSetDetail>(
      `/api/characters/${characterId}/gear-sets`,
      { method: 'POST', body: JSON.stringify(body) })
    await reload()
    return created
  }, [characterId, reload])

  const updateSet = useCallback(async (setId: number, body: SaveBody) => {
    const updated = await api<GearSetDetail>(
      `/api/characters/${characterId}/gear-sets/${setId}`,
      { method: 'PUT', body: JSON.stringify(body) })
    await reload()
    return updated
  }, [characterId, reload])

  const deleteSet = useCallback(async (setId: number) => {
    await api(`/api/characters/${characterId}/gear-sets/${setId}`, { method: 'DELETE' })
    await reload()
  }, [characterId, reload])

  return { sets, loading, error, reload, getSet, createSet, updateSet, deleteSet }
}
