import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { api } from '../../api/client'
import type { CategoryResponse } from '../../types/api'

interface Props {
  onCategoryChanged: () => void
  editingCategory: CategoryResponse | null
  onCancelEdit: () => void
}

export default function ForumCategoryManager({ onCategoryChanged, editingCategory, onCancelEdit }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [displayOrder, setDisplayOrder] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isEditing = editingCategory != null

  // Sync form when editing category changes
  if (isEditing && name === '' && editingCategory.name !== '') {
    setName(editingCategory.name)
    setDescription(editingCategory.description)
    setDisplayOrder(editingCategory.displayOrder)
    setOpen(true)
  }

  const reset = () => {
    setName('')
    setDescription('')
    setDisplayOrder(0)
    setError('')
    setOpen(false)
    onCancelEdit()
  }

  const submit = async () => {
    if (!name.trim()) return
    setLoading(true)
    setError('')
    try {
      if (isEditing) {
        await api(`/api/forum/categories/${editingCategory.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name, description, displayOrder }),
        })
      } else {
        await api('/api/forum/categories', {
          method: 'POST',
          body: JSON.stringify({ name, description, displayOrder }),
        })
      }
      reset()
      onCategoryChanged()
    } catch {
      setError(isEditing ? 'Failed to update category' : 'Failed to create category')
    } finally {
      setLoading(false)
    }
  }

  if (!open && !isEditing) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500">
        <Plus className="h-4 w-4" /> New Category
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">{isEditing ? 'Edit Category' : 'New Category'}</h3>
        <button onClick={reset} className="text-gray-500 hover:text-gray-300"><X className="h-4 w-4" /></button>
      </div>
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Category name"
        maxLength={100}
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
      />
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Description (optional)"
        maxLength={500}
        rows={2}
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none resize-none"
      />
      <input
        type="number"
        value={displayOrder}
        onChange={e => setDisplayOrder(Number(e.target.value))}
        placeholder="Display order"
        className="w-32 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
      />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button onClick={submit} disabled={loading || !name.trim()} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
        {loading ? 'Saving...' : isEditing ? 'Update' : 'Create'}
      </button>
    </div>
  )
}
