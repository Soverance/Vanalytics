import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { api } from '../../api/client'
import { useNotificationSummary } from '../../hooks/useNotificationSummary'

interface NotificationItem {
  id: number
  type: string
  actorUserId: string | null
  targetUrl: string
  snippet: string | null
  isRead: boolean
  createdAt: string
}

function label(type: string): string {
  switch (type) {
    case 'forum.reply': return 'replied to your post'
    case 'forum.reaction': return 'reacted to your post'
    case 'message.received': return 'sent you a message'
    default: return 'notified you'
  }
}

export default function NotificationBell() {
  const { summary, refresh } = useNotificationSummary()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    api<{ items: NotificationItem[] }>('/api/notifications?limit=15')
      .then((r) => setItems(r.items))
      .catch(() => setItems([]))
  }, [open])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function openItem(n: NotificationItem) {
    setOpen(false)
    if (!n.isRead) { await api(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {}); refresh() }
    // Only follow app-internal paths; never a protocol-relative or external URL.
    navigate(n.targetUrl.startsWith('/') && !n.targetUrl.startsWith('//') ? n.targetUrl : '/')
  }

  async function markAll() {
    await api('/api/notifications/read-all', { method: 'POST' }).catch(() => {})
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })))
    refresh()
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative text-gray-400 hover:text-white"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {summary.notifications > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
            {summary.notifications > 9 ? '9+' : summary.notifications}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-gray-800 bg-gray-900 shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
            <span className="text-sm font-medium text-gray-200">Notifications</span>
            <button onClick={markAll} className="text-xs text-blue-400 hover:text-blue-300">Mark all read</button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-gray-500">Nothing new.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-800/50 ${n.isRead ? 'text-gray-400' : 'text-gray-100'}`}
                >
                  <span className="font-medium">Someone</span> {label(n.type)}
                  {n.snippet && <span className="block truncate text-xs text-gray-500">{n.snippet}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
