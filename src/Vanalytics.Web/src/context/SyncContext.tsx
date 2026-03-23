import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from 'react'
import { getStoredTokens } from '../api/client'

interface SyncProgress {
  providerId: string
  type: string
  message?: string
  currentItem?: string
  currentItemId?: number
  current: number
  total: number
  added: number
  updated: number
  skipped: number
  failed: number
}

interface SyncContextValue {
  /** Current progress per provider. Survives navigation. */
  progress: Record<string, SyncProgress | null>
  /** Whether we have an active SSE stream for a provider */
  isStreaming: (providerId: string) => boolean
  /** Open an SSE stream for a provider. No-op if already streaming. */
  startStream: (providerId: string, onComplete?: () => void) => void
  /** Close the SSE stream for a provider */
  stopStream: (providerId: string) => void
}

const SyncContext = createContext<SyncContextValue | null>(null)

export function useSyncProgress() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSyncProgress must be used within SyncProvider')
  return ctx
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Record<string, SyncProgress | null>>({})
  const streams = useRef<Record<string, AbortController>>({})
  const callbacks = useRef<Record<string, (() => void) | undefined>>({})

  const isStreaming = useCallback((providerId: string) => {
    return providerId in streams.current
  }, [])

  const startStream = useCallback((providerId: string, onComplete?: () => void) => {
    // Already streaming — just update the callback
    if (streams.current[providerId]) {
      callbacks.current[providerId] = onComplete
      return
    }

    const controller = new AbortController()
    streams.current[providerId] = controller
    callbacks.current[providerId] = onComplete

    const run = async () => {
      const { accessToken } = getStoredTokens()
      try {
        const response = await fetch(`/api/admin/sync/${providerId}/progress`, {
          headers: { Authorization: `Bearer ${accessToken ?? ''}` },
          signal: controller.signal,
        })

        if (!response.ok || !response.body) return

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const blocks = buffer.split('\n\n')
          buffer = blocks.pop()!
          for (const block of blocks) {
            const dataMatch = block.match(/^data: (.+)$/m)
            if (dataMatch) {
              const evt: SyncProgress = JSON.parse(dataMatch[1])
              setProgress(prev => ({ ...prev, [providerId]: evt }))
              if (evt.type === 'Completed' || evt.type === 'Cancelled' || evt.type === 'Failed') {
                callbacks.current[providerId]?.()
              }
            }
          }
        }
      } catch {
        // Aborted or network error — silent
      } finally {
        delete streams.current[providerId]
        delete callbacks.current[providerId]
      }
    }

    run()
  }, [])

  const stopStream = useCallback((providerId: string) => {
    streams.current[providerId]?.abort()
    delete streams.current[providerId]
    delete callbacks.current[providerId]
  }, [])

  return (
    <SyncContext.Provider value={{ progress, isStreaming, startStream, stopStream }}>
      {children}
    </SyncContext.Provider>
  )
}
