// src/Vanalytics.Web/src/pages/ItemDatabasePage.tsx
import { useState, useEffect } from 'react'
import type { ItemSearchResult } from '../types/api'
import ItemSearchBar from '../components/economy/ItemSearchBar'
import ItemFilters from '../components/economy/ItemFilters'
import ItemCard from '../components/economy/ItemCard'

export default function ItemDatabasePage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [job, setJob] = useState('')
  const [skill, setSkill] = useState('')
  const [minLevel, setMinLevel] = useState('')
  const [maxLevel, setMaxLevel] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<ItemSearchResult | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/items/categories')
      .then((r) => r.ok ? r.json() : [])
      .then(setCategories)
      .catch(() => {})
  }, [])

  useEffect(() => {
    setPage(1)
  }, [query, category, job, skill, minLevel, maxLevel])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (category) params.set('category', category)
    if (job) params.set('jobs', job)
    if (skill) params.set('skill', skill)
    if (minLevel) params.set('minLevel', minLevel)
    if (maxLevel) params.set('maxLevel', maxLevel)
    params.set('page', page.toString())
    params.set('pageSize', '25')

    fetch(`/api/items?${params}`)
      .then((r) => r.json())
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false))
  }, [query, category, job, skill, minLevel, maxLevel, page])

  const totalPages = result ? Math.ceil(result.totalCount / result.pageSize) : 1

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <img src="/vanalytics-square-logo.png" alt="" className="h-10 w-10 shrink-0 -mr-1" />
        <img src="/vanalytics-typography-horizontal-logo.png" alt="Vana'lytics" className="h-6" />
      </div>

      <h1 className="text-2xl font-bold mb-2">Item Database</h1>
      <p className="text-sm text-gray-500 mb-6">
        Browse {result?.totalCount?.toLocaleString() ?? '...'} items from Vana'diel
      </p>

      <div className="space-y-4 mb-6">
        <ItemSearchBar value={query} onChange={setQuery} />
        <ItemFilters
          categories={categories}
          selectedCategory={category}
          onCategoryChange={(c) => { setCategory(c); if (c !== 'Weapon') setSkill('') }}
          selectedJob={job}
          onJobChange={setJob}
          minLevel={minLevel}
          maxLevel={maxLevel}
          onMinLevelChange={setMinLevel}
          onMaxLevelChange={setMaxLevel}
          selectedSkill={skill}
          onSkillChange={setSkill}
        />
      </div>

      {loading ? (
        <p className="text-gray-400">Loading items...</p>
      ) : result && result.items.length > 0 ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {result.items.map((item) => (
              <ItemCard key={item.itemId} item={item} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded px-3 py-1.5 text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded px-3 py-1.5 text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="text-gray-500">No items found.</p>
      )}
    </div>
  )
}
