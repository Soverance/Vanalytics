import { useState, useEffect, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Pin, Lock, Trash2, Flame, RotateCcw } from 'lucide-react'
import { api, ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { ThreadDetailResponse, PaginatedPosts, EnrichedPostResponse, UserProfile } from '../types/api'
import ForumPost from '../components/forum/ForumPost'
import ForumReplyBox from '../components/forum/ForumReplyBox'
import ConfirmModal from '../components/ConfirmModal'

function isModerator(user: UserProfile | null): boolean {
  return user?.role === 'Moderator' || user?.role === 'Admin'
}

function isAdmin(user: UserProfile | null): boolean {
  return user?.role === 'Admin'
}

export default function ForumThreadPage() {
  const { categorySlug, threadSlug } = useParams<{ categorySlug: string; threadSlug: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [thread, setThread] = useState<ThreadDetailResponse | null>(null)
  const [posts, setPosts] = useState<EnrichedPostResponse[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingThread, setLoadingThread] = useState(true)
  const [loadingPosts, setLoadingPosts] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false)
  const [replyTo, setReplyTo] = useState<{ postId: number; username: string } | null>(null)

  useEffect(() => {
    if (!categorySlug || !threadSlug) return
    setLoadingThread(true)
    api<ThreadDetailResponse>(`/api/forum/categories/${categorySlug}/threads/${threadSlug}`)
      .then(setThread)
      .catch(err => {
        if (err instanceof ApiError) setError(`Failed to load thread (${err.status})`)
        else setError('Failed to load thread')
      })
      .finally(() => setLoadingThread(false))
  }, [categorySlug, threadSlug])

  const fetchPosts = useCallback((threadId: number) => {
    setLoadingPosts(true)
    api<PaginatedPosts>(`/api/forum/threads/${threadId}/posts?limit=25`)
      .then(result => {
        setPosts(result.posts)
        setHasMore(result.hasMore)
      })
      .catch(() => {/* posts error is non-critical if thread loaded */})
      .finally(() => setLoadingPosts(false))
  }, [])

  useEffect(() => {
    if (thread) fetchPosts(thread.id)
  }, [thread, fetchPosts])

  const loadMore = async () => {
    if (!thread || posts.length === 0) return
    const afterId = posts[posts.length - 1]!.id
    setLoadingMore(true)
    try {
      const result = await api<PaginatedPosts>(
        `/api/forum/threads/${thread.id}/posts?limit=25&afterId=${afterId}`
      )
      setPosts(prev => [...prev, ...result.posts])
      setHasMore(result.hasMore)
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false)
    }
  }

  const handleTogglePin = async () => {
    if (!thread) return
    try {
      await api(`/api/forum/threads/${thread.id}/pin`, { method: 'PUT' })
      setThread(prev => prev ? { ...prev, isPinned: !prev.isPinned } : prev)
    } catch {
      alert('Failed to update pin status')
    }
  }

  const handleToggleLock = async () => {
    if (!thread) return
    try {
      await api(`/api/forum/threads/${thread.id}/lock`, { method: 'PUT' })
      setThread(prev => prev ? { ...prev, isLocked: !prev.isLocked } : prev)
    } catch {
      alert('Failed to update lock status')
    }
  }

  const handleDeleteThread = async () => {
    if (!thread) return
    try {
      const isAuthor = user?.id === thread.authorId
      const endpoint = mod && !isAuthor
        ? `/api/forum/threads/${thread.id}/moderate`
        : `/api/forum/threads/${thread.id}`
      await api(endpoint, { method: 'DELETE' })
      navigate(`/forum/${categorySlug}`)
    } catch {
      alert('Failed to delete thread')
    }
  }

  const handleRestoreThread = async () => {
    if (!thread) return
    try {
      await api(`/api/forum/threads/${thread.id}/restore`, { method: 'PUT' })
      setThread(prev => prev ? { ...prev, isDeleted: false } : prev)
    } catch {
      alert('Failed to restore thread')
    }
  }

  const handlePurgeThread = async () => {
    if (!thread) return
    try {
      await api(`/api/forum/threads/${thread.id}/purge`, { method: 'DELETE' })
      navigate(`/forum/${categorySlug}`)
    } catch {
      alert('Failed to purge thread')
    }
  }

  const onPostCreated = () => {
    setReplyTo(null)
    if (thread) fetchPosts(thread.id)
  }

  const mod = isModerator(user)
  const admin = isAdmin(user)
  const canDelete = thread && !thread.isDeleted && (mod || user?.id === thread.authorId)

  const handlePurged = (threadDeleted: boolean) => {
    if (threadDeleted) {
      navigate(`/forum/${categorySlug}`)
    } else {
      if (thread) fetchPosts(thread.id)
    }
  }

  const handleQuote = (postId: number, username: string) => {
    setReplyTo({ postId, username })
    document.querySelector('[data-reply-box]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (loadingThread) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return <p className="text-center text-red-400 py-20">{error}</p>
  }

  if (!thread) return null

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
        <Link to="/forum" className="hover:text-gray-300 transition-colors">Forum</Link>
        <span>/</span>
        <Link to={`/forum/${categorySlug}`} className="hover:text-gray-300 transition-colors">{thread.categoryName}</Link>
        <span>/</span>
        <span className="text-gray-300 truncate max-w-xs">{thread.title}</span>
      </nav>

      {/* Deleted thread banner */}
      {thread.isDeleted && mod && (
        <div className="rounded-lg border border-red-800/50 bg-red-900/20 p-4 flex items-center justify-between gap-4">
          <p className="text-red-400 text-sm font-medium">This thread has been deleted</p>
          <div className="flex gap-2 shrink-0">
            {admin && (
              <>
                <button
                  onClick={handleRestoreThread}
                  className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium border border-green-700 text-green-400 hover:bg-green-900/30 transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restore
                </button>
                <button
                  onClick={() => setShowPurgeConfirm(true)}
                  className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium border border-red-700 text-red-400 hover:bg-red-900/30 transition-colors"
                >
                  <Flame className="h-3.5 w-3.5" />
                  Purge
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Thread header */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {thread.isPinned && <Pin className="h-4 w-4 text-blue-400 shrink-0" />}
              {thread.isLocked && <Lock className="h-4 w-4 text-amber-400 shrink-0" />}
              <h1 className="text-xl font-bold text-gray-100">{thread.title}</h1>
            </div>
            <p className="text-sm text-gray-500">
              by <span className="text-gray-400">{thread.authorDisplayName ?? thread.authorUsername}</span>
              {' · '}
              {new Date(thread.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {mod && !thread.isDeleted && (
              <>
                <button
                  onClick={handleTogglePin}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                    thread.isPinned
                      ? 'bg-blue-900/50 text-blue-300 hover:bg-blue-900'
                      : 'border border-gray-700 text-gray-400 hover:text-blue-400'
                  }`}
                >
                  {thread.isPinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  onClick={handleToggleLock}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                    thread.isLocked
                      ? 'bg-amber-900/50 text-amber-300 hover:bg-amber-900'
                      : 'border border-gray-700 text-gray-400 hover:text-amber-400'
                  }`}
                >
                  {thread.isLocked ? 'Unlock' : 'Lock'}
                </button>
              </>
            )}
            {canDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded px-3 py-1.5 text-xs font-medium border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-700 transition-colors"
                title="Delete thread"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            {admin && !thread.isDeleted && (
              <button
                onClick={() => setShowPurgeConfirm(true)}
                className="rounded px-3 py-1.5 text-xs font-medium border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-700 transition-colors"
                title="Purge permanently"
              >
                <Flame className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Posts */}
      {loadingPosts ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post, index) => (
            <ForumPost
              key={post.id}
              post={post}
              isFirstPost={index === 0}
              isAuthor={user?.id === post.authorId}
              isModerator={mod}
              isAdmin={admin}
              isAuthenticated={user !== null}
              onUpdated={onPostCreated}
              onPurged={handlePurged}
              onQuote={handleQuote}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded border border-gray-700 px-5 py-2 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}

      {/* Reply section */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        {thread.isDeleted ? (
          <p className="text-center text-red-400 text-sm py-4">This thread has been deleted.</p>
        ) : thread.isLocked ? (
          <p className="text-center text-amber-400 text-sm py-4">This thread is locked.</p>
        ) : user ? (
          <div data-reply-box>
            <ForumReplyBox
              threadId={thread.id}
              onPostCreated={onPostCreated}
              replyToPostId={replyTo?.postId}
              replyToUsername={replyTo?.username}
              onClearReply={() => setReplyTo(null)}
            />
          </div>
        ) : (
          <p className="text-center text-gray-500 text-sm py-4">
            <Link to="/login" className="text-blue-400 hover:text-blue-300">Sign in</Link>
            {' to reply'}
          </p>
        )}
      </div>

      {showDeleteConfirm && (
        <ConfirmModal
          message="Delete this thread? It will be hidden from regular users."
          confirmLabel="Delete"
          onConfirm={() => { handleDeleteThread(); setShowDeleteConfirm(false) }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {showPurgeConfirm && (
        <ConfirmModal
          message="Permanently delete this thread, all its posts, and all attachments."
          confirmLabel="Purge"
          variant="danger"
          confirmText="PURGE"
          onConfirm={() => { handlePurgeThread(); setShowPurgeConfirm(false) }}
          onCancel={() => setShowPurgeConfirm(false)}
        />
      )}
    </div>
  )
}
