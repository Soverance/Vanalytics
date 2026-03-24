import { useState } from 'react'
import { api } from '../../api/client'
import ForumEditor from './ForumEditor'

interface Props {
  threadId: number
  onPostCreated: () => void
}

export default function ForumReplyBox({ threadId, onPostCreated }: Props) {
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!body.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      await api(`/api/forum/threads/${threadId}/posts`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      })
      setBody('')
      onPostCreated()
    } catch {
      setError('Failed to post reply')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <ForumEditor content={body} onChange={setBody} placeholder="Write a reply..." />
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
