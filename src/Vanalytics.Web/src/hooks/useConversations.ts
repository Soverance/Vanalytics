import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'

export interface ConversationUser {
  id: string; username: string | null; displayName: string | null; avatarUrl: string | null
}
export interface ConversationListItem {
  id: number; other: ConversationUser; lastMessagePreview: string | null
  lastMessageAt: string; unreadCount: number
}

export function useConversations() {
  const [items, setItems] = useState<ConversationListItem[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ items: ConversationListItem[]; hasMore: boolean }>('/api/messages/conversations')
      setItems(data.items)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  return { items, loading, refresh }
}
