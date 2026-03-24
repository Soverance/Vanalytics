import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { api } from '../../api/client'
import type { EnrichedPostResponse } from '../../types/api'
import ForumAuthorBadge from './ForumAuthorBadge'
import ForumVoteButton from './ForumVoteButton'
import ForumEditor from './ForumEditor'

interface Props {
  post: EnrichedPostResponse
  isAuthor: boolean
  isModerator: boolean
  isAuthenticated: boolean
  onUpdated: () => void
}

export default function ForumPost({ post, isAuthor, isModerator, isAuthenticated, onUpdated }: Props) {
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(post.body ?? '')

  const canEdit = (isAuthor || isModerator) && !post.isDeleted
  const canDelete = (isAuthor || isModerator) && !post.isDeleted

  const saveEdit = async () => {
    if (!editBody.trim()) return
    const endpoint = isModerator && !isAuthor
      ? `/api/forum/posts/${post.id}/moderate`
      : `/api/forum/posts/${post.id}`
    await api(endpoint, { method: 'PUT', body: JSON.stringify({ body: editBody }) })
    setEditing(false)
    onUpdated()
  }

  const deletePost = async () => {
    if (!confirm('Delete this post?')) return
    const endpoint = isModerator && !isAuthor
      ? `/api/forum/posts/${post.id}/moderate`
      : `/api/forum/posts/${post.id}`
    await api(endpoint, { method: 'DELETE' })
    onUpdated()
  }

  if (post.isDeleted) {
    return (
      <div className="flex gap-4 rounded-lg border border-gray-800/50 bg-gray-900/30 p-4">
        <ForumAuthorBadge username={post.authorUsername} postCount={post.authorPostCount} joinedAt={post.authorJoinedAt} />
        <div className="flex-1">
          <p className="text-gray-600 italic text-sm">[This post has been deleted]</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-4 rounded-lg border border-gray-800 bg-gray-900 p-4">
      <ForumAuthorBadge username={post.authorUsername} postCount={post.authorPostCount} joinedAt={post.authorJoinedAt} />
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="space-y-2">
            <ForumEditor content={editBody} onChange={setEditBody} />
            <div className="flex gap-2">
              <button onClick={saveEdit} className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500">Save</button>
              <button onClick={() => setEditing(false)} className="rounded px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <ForumEditor content={post.body ?? ''} editable={false} />
            <div className="flex items-center gap-3 mt-3">
              <ForumVoteButton postId={post.id} voteCount={post.voteCount} userVoted={post.currentUserVoted} disabled={!isAuthenticated} />
              <span className="text-xs text-gray-600">{new Date(post.createdAt).toLocaleString()}</span>
              {post.isEdited && <span className="text-xs text-gray-600 italic">edited</span>}
              <div className="flex-1" />
              {canEdit && (
                <button onClick={() => setEditing(true)} className="text-gray-600 hover:text-gray-300 p-1" title="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {canDelete && (
                <button onClick={deletePost} className="text-gray-600 hover:text-red-400 p-1" title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
