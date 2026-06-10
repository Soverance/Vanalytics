import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'

export default function MessageButton({ toUserId }: { toUserId: string }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  if (!user || user.id === toUserId) return null

  async function send() {
    const text = body.trim()
    if (!text) return
    setError(null)
    try {
      const r = await api<{ conversationId: number }>('/api/messages', {
        method: 'POST', body: JSON.stringify({ toUserId, body: text }),
      })
      navigate(`/messages/${r.conversationId}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not send.')
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500">
        <MessageSquare className="h-4 w-4" /> Message
      </button>
    )
  }
  return (
    <div className="space-y-2">
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Write a message…"
        className="w-full resize-none rounded bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none" />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={send} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500">Send</button>
        <button onClick={() => setOpen(false)} className="rounded px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
      </div>
    </div>
  )
}
