import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { api } from '../../api/client'
import ForumEditor from './ForumEditor'
import DraftStatus from './DraftStatus'
import { useDraft } from '../../hooks/useDraft'
import { useAuth } from '../../context/AuthContext'

interface Props {
  threadId: number
  onPostCreated: () => void
  replyToPostId?: number | null
  replyToUsername?: string | null
  onClearReply?: () => void
}

export default function ForumReplyBox({ threadId, onPostCreated, replyToPostId, replyToUsername, onClearReply }: Props) {
  const { user } = useAuth()
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const draftKey = user ? `forum-draft:reply:${user.id}:${threadId}` : null
  const { draft, savedAt, saving, save, clear } = useDraft<{ body: string }>(draftKey)
  const [restored, setRestored] = useState(false)
  const restoredOnce = useRef(false)

  // Restore a saved reply draft once it (and the user) are available — runs once.
  useEffect(() => {
    if (restoredOnce.current) return
    if (draft && draft.body && !body) {
      setBody(draft.body)
      setRestored(true)
      restoredOnce.current = true
    }
  }, [draft, body])

  const onBodyChange = (v: string) => {
    setBody(v)
    setRestored(false)
    if (v) save({ body: v })
    else clear()
  }

  const discardDraft = () => {
    clear()
    setBody('')
    setRestored(false)
  }

  const submit = async () => {
    if (!body.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      await api(`/api/forum/threads/${threadId}/posts`, {
        method: 'POST',
        body: JSON.stringify({
          body,
          replyToPostId: replyToPostId ?? undefined,
        }),
      })
      setBody('')
      clear()
      onClearReply?.()
      onPostCreated()
    } catch {
      setError('Failed to post reply')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      {replyToPostId && replyToUsername && (
        <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-800/50 rounded px-3 py-1.5">
          <span>Replying to <span className="font-medium text-gray-300">{replyToUsername}</span></span>
          <button onClick={onClearReply} className="text-gray-600 hover:text-gray-300 ml-auto" title="Cancel reply">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <ForumEditor content={body} onChange={onBodyChange} placeholder="Write a reply..." />
      <DraftStatus saving={saving} savedAt={savedAt} restored={restored} onDiscard={discardDraft} />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        onClick={submit}
        disabled={loading || !body.trim()}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {loading ? 'Posting...' : 'Reply'}
      </button>
    </div>
  )
}
