import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useConversations } from '../hooks/useConversations'
import ConversationView from '../components/messages/ConversationView'
import { api } from '../api/client'

interface BlockedUser { id: string; username: string | null; displayName: string | null; avatarUrl: string | null }

export default function MessagesPage() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const { items, refresh } = useConversations()
  const navigate = useNavigate()
  const selectedId = conversationId ? Number(conversationId) : null

  // Blocked users modal state
  const [blockedOpen, setBlockedOpen] = useState(false)
  const [blocked, setBlocked] = useState<BlockedUser[]>([])
  const [loadingBlocked, setLoadingBlocked] = useState(false)

  async function fetchBlocked() {
    setLoadingBlocked(true)
    try {
      const data = await api<{ users: BlockedUser[] }>('/api/messages/blocked')
      setBlocked(data?.users ?? [])
    } catch {
      setBlocked([])
    } finally {
      setLoadingBlocked(false)
    }
  }

  function openBlocked() {
    setBlockedOpen(true)
    fetchBlocked()
  }

  function closeBlocked() {
    setBlockedOpen(false)
  }

  async function unblock(userId: string) {
    try {
      await api(`/api/users/${userId}/block`, { method: 'DELETE' })
      setBlocked((prev) => prev.filter((u) => u.id !== userId))
      refresh()
    } catch {
      // silently ignore unblock failure
    }
  }

  // Close blocked modal on Escape
  useEffect(() => {
    if (!blockedOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeBlocked() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [blockedOpen])

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-3 p-4">
      <aside className="w-72 shrink-0 overflow-y-auto rounded-lg border border-gray-800">
        <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Conversations</span>
          <button
            onClick={openBlocked}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Blocked
          </button>
        </div>
        {items.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No conversations yet.</p>
        ) : items.map((c) => (
          <button
            key={c.id}
            onClick={() => navigate(`/messages/${c.id}`)}
            className={`block w-full border-b border-gray-800 px-3 py-2 text-left hover:bg-gray-800/50 ${selectedId === c.id ? 'bg-gray-800' : ''}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-200">{c.other.displayName ?? c.other.username ?? 'User'}</span>
              {c.unreadCount > 0 && <span className="rounded-full bg-blue-600 px-1.5 text-[10px] text-white">{c.unreadCount}</span>}
            </div>
            {c.lastMessagePreview && <p className="truncate text-xs text-gray-500">{c.lastMessagePreview}</p>}
          </button>
        ))}
      </aside>
      <main className="flex-1 rounded-lg border border-gray-800">
        {selectedId ? <ConversationView conversationId={selectedId} onSent={refresh} /> : <div className="p-4 text-sm text-gray-500">Select a conversation.</div>}
      </main>

      {/* Blocked users modal */}
      {blockedOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={closeBlocked}
        >
          <div
            className="rounded-lg p-6 max-w-md w-full mx-4 bg-gray-900 border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-gray-200 mb-4">Blocked users</h2>

            {loadingBlocked ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : blocked.length === 0 ? (
              <p className="text-sm text-gray-500">You haven't blocked anyone.</p>
            ) : (
              <ul className="space-y-2 mb-4">
                {blocked.map((u) => (
                  <li key={u.id} className="flex items-center justify-between rounded bg-gray-800 px-3 py-2">
                    <span className="text-sm text-gray-200">{u.displayName ?? u.username ?? 'User'}</span>
                    <button
                      onClick={() => unblock(u.id)}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Unblock
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-end mt-4">
              <button
                onClick={closeBlocked}
                className="rounded bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
