import { useState, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { CategoryResponse, PaginatedThreads, EnrichedThreadSummaryResponse, UserProfile } from '../types/api'
import ForumThreadRow from '../components/forum/ForumThreadRow'
import ForumSearchBar from '../components/forum/ForumSearchBar'

function isModerator(user: UserProfile | null): boolean {
  return user?.role === 'Moderator' || user?.role === 'Admin'
}

function toNetTicks(isoString: string): number {
  return (new Date(isoString).getTime() * 10000) + 621355968000000000
}

export default function ForumThreadListPage() {
  const { categorySlug } = useParams<{ categorySlug: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [category, setCategory] = useState<CategoryResponse | null>(null)
  const [threads, setThreads] = useState<EnrichedThreadSummaryResponse[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingCategory, setLoadingCategory] = useState(true)
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!categorySlug) return
    setLoadingCategory(true)
    api<CategoryResponse>(`/api/forum/categories/${categorySlug}`)
      .then(setCategory)
      .catch(err => {
        if (err instanceof ApiError) setError(`Failed to load category (${err.status})`)
        else setError('Failed to load category')
      })
      .finally(() => setLoadingCategory(false))
  }, [categorySlug])

  const fetchThreads = () => {
    if (!categorySlug) return
    setLoadingThreads(true)
    setError('')
    api<PaginatedThreads>(`/api/forum/categories/${categorySlug}/threads?limit=25`)
      .then(result => {
        setThreads(result.threads)
        setHasMore(result.hasMore)
      })
      .catch(err => {
        if (err instanceof ApiError) setError(`Failed to load threads (${err.status})`)
        else setError('Failed to load threads')
      })
      .finally(() => setLoadingThreads(false))
  }

  useEffect(() => {
    fetchThreads()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorySlug])

  const loadMore = async () => {
    if (!categorySlug || threads.length === 0) return
    const last = threads[threads.length - 1]
    const afterLastPostAtTicks = toNetTicks(last.lastPostAt)
    const afterId = last.id
    setLoadingMore(true)
    try {
      const result = await api<PaginatedThreads>(
        `/api/forum/categories/${categorySlug}/threads?limit=25&afterLastPostAtTicks=${afterLastPostAtTicks}&afterId=${afterId}`
      )
      setThreads(prev => [...prev, ...result.threads])
      setHasMore(result.hasMore)
    } catch {
      // silently fail — user can retry
    } finally {
      setLoadingMore(false)
    }
  }

  const handleTogglePin = async (threadId: number) => {
    try {
      await api(`/api/forum/threads/${threadId}/pin`, { method: 'PUT' })
      fetchThreads()
    } catch {
      alert('Failed to update pin status')
    }
  }

  const handleToggleLock = async (threadId: number) => {
    try {
      await api(`/api/forum/threads/${threadId}/lock`, { method: 'PUT' })
      fetchThreads()
    } catch {
      alert('Failed to update lock status')
    }
  }

  const mod = isModerator(user)
  const loading = loadingCategory || loadingThreads

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/forum" className="hover:text-gray-300 transition-colors">Forum</Link>
        <span>/</span>
        <span className="text-gray-300">{category?.name ?? categorySlug}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">{category?.name ?? ''}</h1>
          {category?.description && <p className="text-sm text-gray-500 mt-1">{category.description}</p>}
          <div className="max-w-lg mt-3">
            <ForumSearchBar />
          </div>
        </div>
        {user ? (
          (!category?.requiresAdminForNewThreads || user.role === 'Admin') && (
            <button
              onClick={() => navigate(`/forum/${categorySlug}/new`)}
              className="shrink-0 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
            >
              New Thread
            </button>
          )
        ) : (
          !category?.requiresAdminForNewThreads && (
            <button
              onClick={() => navigate('/login')}
              className="shrink-0 rounded border border-gray-700 px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 transition-colors"
            >
              Sign in to post
            </button>
          )
        )}
      </div>

      {/* Thread list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : error ? (
        <p className="text-center text-red-400 py-10">{error}</p>
      ) : threads.length === 0 ? (
        <p className="text-center text-gray-500 py-10">No threads yet — be the first to start a discussion!</p>
      ) : (
        <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
          {threads.map(thread => (
            <ForumThreadRow
              key={thread.id}
              thread={thread}
              categorySlug={categorySlug ?? ''}
              isModerator={mod}
              onTogglePin={mod ? handleTogglePin : undefined}
              onToggleLock={mod ? handleToggleLock : undefined}
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
    </div>
  )
}
