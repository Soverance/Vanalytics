import { useState, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { CategoryResponse, ThreadDetailResponse } from '../types/api'
import ForumEditor from '../components/forum/ForumEditor'

export default function ForumNewThreadPage() {
  const { categorySlug } = useParams<{ categorySlug: string }>()
  const navigate = useNavigate()

  const [category, setCategory] = useState<CategoryResponse | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!categorySlug) return
    api<CategoryResponse>(`/api/forum/categories/${categorySlug}`)
      .then(setCategory)
      .catch(() => {/* category name is optional for breadcrumb */})
  }, [categorySlug])

  const handleSubmit = async () => {
    if (!title.trim() || !body.trim() || !categorySlug) return
    setSubmitting(true)
    setError('')
    try {
      const result = await api<ThreadDetailResponse>(`/api/forum/categories/${categorySlug}/threads`, {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), body }),
      })
      navigate(`/forum/${categorySlug}/${result.slug}`)
    } catch (err) {
      if (err instanceof ApiError) setError(`Failed to create thread (${err.status})`)
      else setError('Failed to create thread')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/forum" className="hover:text-gray-300 transition-colors">Forum</Link>
        <span>/</span>
        <Link to={`/forum/${categorySlug}`} className="hover:text-gray-300 transition-colors">
          {category?.name ?? categorySlug}
        </Link>
        <span>/</span>
        <span className="text-gray-300">New Thread</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-gray-100">New Thread</h1>
      </div>

      <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-900 p-4">
        {/* Title */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-400">Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={200}
            placeholder="Thread title"
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
          />
          <p className="text-xs text-gray-600 text-right">{title.length}/200</p>
        </div>

        {/* Body */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-400">Body</label>
          <ForumEditor content={body} onChange={setBody} placeholder="What's on your mind?" />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !body.trim()}
            className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Posting...' : 'Post Thread'}
          </button>
          <Link
            to={`/forum/${categorySlug}`}
            className="rounded px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  )
}
