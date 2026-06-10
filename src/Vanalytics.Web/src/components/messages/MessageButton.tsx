import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'

// Matches the Messages.Body column (nvarchar(4000)); the server rejects longer.
const MAX_BODY = 4000

export default function MessageButton({ toUserId, toName }: { toUserId: string; toName?: string }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  // Close the composer on Escape (but never mid-send).
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  if (!user || user.id === toUserId) return null

  function openComposer() {
    setBody('')
    setError(null)
    setOpen(true)
  }

  function close() {
    if (sending) return
    setOpen(false)
    setError(null)
  }

  async function send() {
    const text = body.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    try {
      const r = await api<{ conversationId: number }>('/api/messages', {
        method: 'POST', body: JSON.stringify({ toUserId, body: text }),
      })
      navigate(`/messages/${r.conversationId}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not send.')
      setSending(false)
    }
  }

  return (
    <>
      <button
        onClick={openComposer}
        className="inline-flex items-center gap-2 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
      >
        <MessageSquare className="h-4 w-4" /> Message
      </button>

      {/* Composer modal — overlays the page so it never shifts surrounding layout. */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={close}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-lg font-bold text-gray-100">
              {toName ? `Message ${toName}` : 'Send a message'}
            </h2>

            {error && (
              <p className="mb-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
            )}

            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
              placeholder="Write a message…"
              rows={6}
              autoFocus
              disabled={sending}
              className="min-h-[8rem] w-full resize-y rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-gray-500 disabled:opacity-50"
            />
            <p className="mb-4 mt-1 text-right text-xs text-gray-600">{body.length}/{MAX_BODY}</p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={close}
                disabled={sending}
                className="rounded border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={send}
                disabled={sending || !body.trim()}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
