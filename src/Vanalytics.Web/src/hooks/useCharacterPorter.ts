import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { PorterSlip } from '../types/api'

export interface UseCharacterPorter {
  slips: PorterSlip[]
  byItemId: Map<number, number[]>
  loading: boolean
  error: Error | null
  refresh: () => void
  hideSlip: (slipItemId: number, hidden: boolean) => Promise<void>
  forgetSlip: (slipItemId: number) => Promise<void>
}

export function useCharacterPorter(characterId: string): UseCharacterPorter {
  const [slips, setSlips] = useState<PorterSlip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchPorter = useCallback(() => {
    setLoading(true)
    api<PorterSlip[]>(`/api/characters/${characterId}/porter`)
      .then(data => {
        setSlips(data ?? [])
        setError(null)
      })
      .catch((e: Error) => {
        setSlips([])
        setError(e)
      })
      .finally(() => setLoading(false))
  }, [characterId])

  useEffect(() => {
    fetchPorter()
  }, [fetchPorter])

  const byItemId = useMemo(() => {
    const map = new Map<number, number[]>()
    for (const slip of slips) {
      if (slip.userHidden) continue
      for (const item of slip.items) {
        const list = map.get(item.itemId) ?? []
        list.push(slip.slipNumber)
        map.set(item.itemId, list)
      }
    }
    return map
  }, [slips])

  const hideSlip = useCallback(async (slipItemId: number, hidden: boolean) => {
    await api(`/api/characters/${characterId}/porter/${slipItemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ userHidden: hidden }),
    })
    setSlips(prev => prev.map(s =>
      s.slipItemId === slipItemId ? { ...s, userHidden: hidden } : s
    ))
  }, [characterId])

  const forgetSlip = useCallback(async (slipItemId: number) => {
    await api(`/api/characters/${characterId}/porter/${slipItemId}`, {
      method: 'DELETE',
    })
    setSlips(prev => prev.filter(s => s.slipItemId !== slipItemId))
  }, [characterId])

  return { slips, byItemId, loading, error, refresh: fetchPorter, hideSlip, forgetSlip }
}
