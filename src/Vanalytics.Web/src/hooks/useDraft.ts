import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000 // 14 days — don't resurrect ancient drafts
const DEFAULT_DEBOUNCE_MS = 600

interface StoredDraft<T> {
  value: T
  savedAt: number
}

export interface DraftState<T> {
  /** The restored draft for the current key, or null if none. */
  draft: T | null
  /** Timestamp (ms) of the last persisted save, or null. */
  savedAt: number | null
  /** True while a debounced write is pending. */
  saving: boolean
  /** Persist a value (debounced). No-op when key is null. */
  save: (value: T) => void
  /** Remove the draft and cancel any pending write. */
  clear: () => void
}

function read<T>(key: string): StoredDraft<T> | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft<T>
    if (!parsed || typeof parsed.savedAt !== 'number') return null
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(key)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/**
 * Persist a value to localStorage under `key`, restoring it on mount.
 * Pass `key === null` to keep the hook inert (e.g. before the user has loaded).
 * Storage failures (private mode / quota) degrade silently.
 */
export function useDraft<T>(key: string | null, opts?: { debounceMs?: number }): DraftState<T> {
  const debounceMs = opts?.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const [draft, setDraft] = useState<T | null>(() => (key ? read<T>(key)?.value ?? null : null))
  const [savedAt, setSavedAt] = useState<number | null>(() => (key ? read<T>(key)?.savedAt ?? null : null))
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Re-read when the key changes — e.g. auth/user resolves after first render.
  useEffect(() => {
    const stored = key ? read<T>(key) : null
    setDraft(stored?.value ?? null)
    setSavedAt(stored?.savedAt ?? null)
  }, [key])

  // Cancel any pending write on unmount.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const save = useCallback((value: T) => {
    if (!key) return
    setSaving(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const at = Date.now()
      try {
        localStorage.setItem(key, JSON.stringify({ value, savedAt: at } satisfies StoredDraft<T>))
        setSavedAt(at)
      } catch {
        // storage unavailable / over quota — degrade silently
      }
      setSaving(false)
    }, debounceMs)
  }, [key, debounceMs])

  const clear = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    setSaving(false)
    setSavedAt(null)
    setDraft(null)
    if (!key) return
    try { localStorage.removeItem(key) } catch { /* ignore */ }
  }, [key])

  return { draft, savedAt, saving, save, clear }
}
