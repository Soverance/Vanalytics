import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { WorkflowGraph, WorkflowResponse, GenerateWorkflowResponse } from '../types/api'

export function useJobWorkflow(characterId: string, job: string) {
  const [graph, setGraph] = useState<WorkflowGraph | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api<WorkflowResponse>(`/api/characters/${characterId}/workflows/${job}`)
      .then(d => { if (!cancelled) { setGraph(d.graph); setUpdatedAt(d.updatedAt); setError(null) } })
      .catch(e => { if (!cancelled) { setGraph({ version: 1, nodes: [], edges: [] }); setError(e as Error) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [characterId, job])

  const save = useCallback(async (next: WorkflowGraph) => {
    const resp = await api<WorkflowResponse>(
      `/api/characters/${characterId}/workflows/${job}`,
      { method: 'PUT', body: JSON.stringify(next) })
    setUpdatedAt(resp.updatedAt)
  }, [characterId, job])

  const generate = useCallback(
    () => api<GenerateWorkflowResponse>(
      `/api/characters/${characterId}/workflows/${job}/generate`, { method: 'POST' }),
    [characterId, job])

  return { graph, setGraph, updatedAt, loading, error, save, generate }
}
