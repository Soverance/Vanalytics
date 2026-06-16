import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { BlueprintGraph, BlueprintResponse, GenerateBlueprintResponse } from '../types/api'

export function useJobBlueprint(characterId: string, job: string) {
  const [graph, setGraph] = useState<BlueprintGraph | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api<BlueprintResponse>(`/api/characters/${characterId}/blueprints/${job}`)
      .then(d => { if (!cancelled) { setGraph(d.graph); setUpdatedAt(d.updatedAt); setError(null) } })
      .catch(e => { if (!cancelled) { setGraph({ version: 1, nodes: [], edges: [] }); setError(e as Error) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [characterId, job])

  const save = useCallback(async (next: BlueprintGraph) => {
    const resp = await api<BlueprintResponse>(
      `/api/characters/${characterId}/blueprints/${job}`,
      { method: 'PUT', body: JSON.stringify(next) })
    setUpdatedAt(resp.updatedAt)
  }, [characterId, job])

  const generate = useCallback(
    () => api<GenerateBlueprintResponse>(
      `/api/characters/${characterId}/blueprints/${job}/generate`, { method: 'POST' }),
    [characterId, job])

  return { graph, setGraph, updatedAt, loading, error, save, generate }
}
