import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'

export interface NotificationSummary {
  notifications: number
  messages: number
}

const POLL_MS = 45_000

export function useNotificationSummary() {
  const { user } = useAuth()
  const [summary, setSummary] = useState<NotificationSummary>({ notifications: 0, messages: 0 })

  const refresh = useCallback(async () => {
    if (!user) { setSummary({ notifications: 0, messages: 0 }); return }
    try {
      const data = await api<NotificationSummary>('/api/notifications/summary')
      setSummary(data)
    } catch {
      /* ignore transient poll failures */
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    refresh()
    const interval = setInterval(refresh, POLL_MS)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [user, refresh])

  return { summary, refresh }
}
