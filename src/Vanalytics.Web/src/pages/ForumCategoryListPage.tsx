import { useState, useEffect } from 'react'
import { api, ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { CategoryResponse, UserProfile } from '../types/api'
import ForumCategoryCard from '../components/forum/ForumCategoryCard'
import ForumCategoryManager from '../components/forum/ForumCategoryManager'

function isModerator(user: UserProfile | null): boolean {
  return user?.role === 'Moderator' || user?.role === 'Admin'
}

export default function ForumCategoryListPage() {
  const { user } = useAuth()
  const [categories, setCategories] = useState<CategoryResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingCategory, setEditingCategory] = useState<CategoryResponse | null>(null)

  const fetchCategories = () => {
    setLoading(true)
    setError('')
    api<CategoryResponse[]>('/api/forum/categories')
      .then(setCategories)
      .catch(err => {
        if (err instanceof ApiError) setError(`Failed to load categories (${err.status})`)
        else setError('Failed to load categories')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this category? This cannot be undone.')) return
    try {
      await api(`/api/forum/categories/${id}`, { method: 'DELETE' })
      fetchCategories()
    } catch {
      alert('Failed to delete category')
    }
  }

  const mod = isModerator(user)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Forum</h1>
        <p className="text-sm text-gray-500">Community discussion</p>
      </div>

      {mod && (
        <ForumCategoryManager
          onCategoryChanged={fetchCategories}
          editingCategory={editingCategory}
          onCancelEdit={() => setEditingCategory(null)}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : error ? (
        <p className="text-center text-red-400 py-10">{error}</p>
      ) : categories.length === 0 ? (
        <p className="text-center text-gray-500 py-10">No categories yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {categories.map(cat => (
            <ForumCategoryCard
              key={cat.id}
              category={cat}
              isModerator={mod}
              onEdit={mod ? setEditingCategory : undefined}
              onDelete={mod ? handleDelete : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
