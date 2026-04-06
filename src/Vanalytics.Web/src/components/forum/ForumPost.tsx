import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Trash2, Flame, Quote } from 'lucide-react'
import { api } from '../../api/client'
import type { EnrichedPostResponse, PurgeResponse } from '../../types/api'
import ForumAuthorBadge from './ForumAuthorBadge'
import ForumReactionBar from './ForumReactionBar'
import ForumEditor from './ForumEditor'
import ConfirmModal from '../ConfirmModal'

interface Props {
  post: EnrichedPostResponse
  isFirstPost?: boolean
  isAuthor: boolean
  isModerator: boolean
  isAdmin: boolean
  isAuthenticated: boolean
  onUpdated: () => void
  onPurged: (threadDeleted: boolean) => void
  onQuote?: (postId: number, username: string) => void
}

export default function ForumPost({ post, isFirstPost, isAuthor, isModerator, isAdmin, isAuthenticated, onUpdated, onPurged, onQuote }: Props) {
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(post.body ?? '')
  const [purging, setPurging] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false)

  const canEdit = (isAuthor || isModerator) && !post.isDeleted
  const canDelete = (isAuthor || isModerator) && !post.isDeleted
  const canPurge = isAdmin

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
    const endpoint = isModerator && !isAuthor
      ? `/api/forum/posts/${post.id}/moderate`
      : `/api/forum/posts/${post.id}`
    await api(endpoint, { method: 'DELETE' })
    onUpdated()
  }

  const purgePost = async () => {
    setPurging(true)
    try {
      const result = await api<PurgeResponse>(`/api/forum/posts/${post.id}/purge`, { method: 'DELETE' })
      onPurged(result.threadDeleted)
    } catch {
      alert('Failed to purge post')
    } finally {
      setPurging(false)
    }
  }

  if (post.isDeleted) {
    return (
      <div id={`post-${post.id}`} className="flex gap-4 rounded-lg border border-gray-800/50 bg-gray-900/30 p-4">
        <ForumAuthorBadge username={post.authorUsername} displayName={post.authorDisplayName} avatarUrl={post.authorAvatarHash} postCount={post.authorPostCount} joinedAt={post.authorJoinedAt} />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <p className="text-gray-600 italic text-sm">[This post has been deleted]</p>
            {canPurge && (
              <button
                onClick={() => setShowPurgeConfirm(true)}
                disabled={purging}
                className="text-gray-600 hover:text-red-500 p-1 disabled:opacity-50"
                title="Purge permanently"
              >
                <Flame className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {showPurgeConfirm && (
          <ConfirmModal
            message={
              isFirstPost
                ? 'This is the first post in the thread. Purging it will permanently delete the ENTIRE THREAD and all its posts and attachments.'
                : 'Permanently delete this post and its attachments.'
            }
            confirmLabel="Purge"
            variant="danger"
            confirmText="PURGE"
            onConfirm={() => { purgePost(); setShowPurgeConfirm(false) }}
            onCancel={() => setShowPurgeConfirm(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div id={`post-${post.id}`} className="flex gap-4 rounded-lg border border-gray-800 bg-gray-900 p-4">
      <ForumAuthorBadge username={post.authorUsername} displayName={post.authorDisplayName} avatarUrl={post.authorAvatarHash} postCount={post.authorPostCount} joinedAt={post.authorJoinedAt} />
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
            {post.quotedPost && (
              <div
                className="border-l-2 border-gray-600 bg-gray-800/50 rounded-r px-3 py-2 mb-2 cursor-pointer hover:bg-gray-800/70 transition-colors"
                onClick={() => {
                  const el = document.getElementById(`post-${post.quotedPost!.id}`)
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }}
              >
                <Link to={`/users/${post.quotedPost.authorUsername}`} className="text-xs font-medium text-gray-400 hover:underline" onClick={e => e.stopPropagation()}>{post.quotedPost.authorDisplayName ?? post.quotedPost.authorUsername}</Link>
                {post.quotedPost.isDeleted ? (
                  <p className="text-xs text-gray-600 italic">[This post has been deleted]</p>
                ) : (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-3">{post.quotedPost.body}</p>
                )}
              </div>
            )}
            <ForumEditor content={post.body ?? ''} editable={false} />
            <div className="flex items-center gap-3 mt-3">
              <ForumReactionBar postId={post.id} reactions={post.reactions} userReactions={post.userReactions} disabled={!isAuthenticated} />
              {isAuthenticated && onQuote && (
                <button
                  onClick={() => onQuote(post.id, post.authorDisplayName ?? post.authorUsername)}
                  className="text-gray-600 hover:text-gray-300 p-1"
                  title="Quote"
                >
                  <Quote className="h-3.5 w-3.5" />
                </button>
              )}
              <span className="text-xs text-gray-600">{new Date(post.createdAt).toLocaleString()}</span>
              {post.isEdited && <span className="text-xs text-gray-600 italic">edited</span>}
              <div className="flex-1" />
              {canEdit && (
                <button onClick={() => setEditing(true)} className="text-gray-600 hover:text-gray-300 p-1" title="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {canDelete && (
                <button onClick={() => setShowDeleteConfirm(true)} className="text-gray-600 hover:text-red-400 p-1" title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              {canPurge && (
                <button onClick={() => setShowPurgeConfirm(true)} disabled={purging} className="text-gray-600 hover:text-red-500 p-1 disabled:opacity-50" title="Purge permanently">
                  <Flame className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {showDeleteConfirm && (
        <ConfirmModal
          message="Delete this post?"
          confirmLabel="Delete"
          onConfirm={() => { deletePost(); setShowDeleteConfirm(false) }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {showPurgeConfirm && (
        <ConfirmModal
          message={
            isFirstPost
              ? 'This is the first post in the thread. Purging it will permanently delete the ENTIRE THREAD and all its posts and attachments.'
              : 'Permanently delete this post and its attachments.'
          }
          confirmLabel="Purge"
          variant="danger"
          confirmText="PURGE"
          onConfirm={() => { purgePost(); setShowPurgeConfirm(false) }}
          onCancel={() => setShowPurgeConfirm(false)}
        />
      )}
    </div>
  )
}
