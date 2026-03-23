import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LayoutGrid, List } from 'lucide-react'
import type { ItemSearchResult, StatFilter } from '../types/api'
import ItemSearchBar from '../components/economy/ItemSearchBar'
import CategoryTree from '../components/economy/CategoryTree'
import StatFilterPanel from '../components/economy/StatFilterPanel'
import ItemCard from '../components/economy/ItemCard'
import ItemTable from '../components/economy/ItemTable'

const JOBS = [
  'WAR', 'MNK', 'WHM', 'BLM', 'RDM', 'THF', 'PLD', 'DRK', 'BST', 'BRD', 'RNG',
  'SAM', 'NIN', 'DRG', 'SMN', 'BLU', 'COR', 'PUP', 'DNC', 'SCH', 'GEO', 'RUN',
]

type ViewMode = 'cards' | 'table'

function parseStatFilters(params: URLSearchParams): StatFilter[] {
  return params.getAll('stats').map(s => {
    const [stat, min, max] = s.split(':')
    return { stat, min: min || '', max: max || '' }
  }).filter(sf => sf.stat)
}

function serializeStatFilters(filters: StatFilter[]): string[] {
  return filters
    .filter(sf => sf.min || sf.max)
    .map(sf => `${sf.stat}:${sf.min}:${sf.max}`)
}

export default function ItemDatabasePage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Read initial state from URL
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [category, setCategory] = useState(searchParams.get('category') || '')
  const [subCategory, setSubCategory] = useState(searchParams.get('subCategory') || '')
  const [job, setJob] = useState(searchParams.get('jobs') || '')
  const [minLevel, setMinLevel] = useState(searchParams.get('minLevel') || '')
  const [maxLevel, setMaxLevel] = useState(searchParams.get('maxLevel') || '')
  const [statFilters, setStatFilters] = useState<StatFilter[]>(() => parseStatFilters(searchParams))
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'name')
  const [sortDir, setSortDir] = useState(searchParams.get('sortDir') || 'asc')
  const [viewMode, setViewMode] = useState<ViewMode>((searchParams.get('view') as ViewMode) || 'cards')
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1)
  const [result, setResult] = useState<ItemSearchResult | null>(null)
  const [loading, setLoading] = useState(true)

  // Sync state → URL (replace, not push, to avoid polluting history with every keystroke)
  const syncUrl = useCallback(() => {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (category) params.set('category', category)
    if (job) params.set('jobs', job)
    if (subCategory) params.set('subCategory', subCategory)
    if (minLevel) params.set('minLevel', minLevel)
    if (maxLevel) params.set('maxLevel', maxLevel)
    if (sortBy && sortBy !== 'name') params.set('sortBy', sortBy)
    if (sortDir === 'desc') params.set('sortDir', 'desc')
    if (viewMode !== 'cards') params.set('view', viewMode)
    for (const s of serializeStatFilters(statFilters)) {
      params.append('stats', s)
    }
    if (page > 1) params.set('page', page.toString())
    setSearchParams(params, { replace: true })
  }, [query, category, subCategory, job, minLevel, maxLevel, statFilters, sortBy, sortDir, viewMode, page, setSearchParams])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [query, category, subCategory, job, minLevel, maxLevel, statFilters, sortBy, sortDir])

  // Fetch data and sync URL
  useEffect(() => {
    syncUrl()
    setLoading(true)
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (category) params.set('category', category)
    if (subCategory) params.set('subCategory', subCategory)
    if (job) params.set('jobs', job)
    if (minLevel) params.set('minLevel', minLevel)
    if (maxLevel) params.set('maxLevel', maxLevel)
    if (sortBy && sortBy !== 'name') params.set('sortBy', sortBy)
    if (sortDir === 'desc') params.set('sortDir', 'desc')

    for (const sf of statFilters) {
      if (sf.min || sf.max) {
        params.append('stats', `${sf.stat}:${sf.min}:${sf.max}`)
      }
    }

    params.set('page', page.toString())
    params.set('pageSize', '25')

    fetch(`/api/items?${params}`)
      .then((r) => r.json())
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false))
  }, [query, category, subCategory, job, minLevel, maxLevel, statFilters, sortBy, sortDir, page]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = result ? Math.ceil(result.totalCount / result.pageSize) : 1

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
  }

  // Build sort options: Name, Level, Item Level, plus any active stat filter stats
  const sortOptions: { value: string; label: string }[] = [
    { value: 'name', label: 'Name' },
    { value: 'level', label: 'Level' },
    { value: 'itemLevel', label: 'Item Level' },
    ...statFilters
      .filter(sf => sf.min || sf.max)
      .map(sf => ({ value: sf.stat, label: sf.stat })),
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Item Database</h1>
      <p className="text-sm text-gray-500 mb-6">
        Browse {result?.totalCount?.toLocaleString() ?? '...'} items from Vana'diel
      </p>

      <div className="grid gap-4 lg:grid-cols-4 mb-6">
        <div className="lg:col-span-1 space-y-4">
          <CategoryTree
            selectedCategory={category}
            selectedSubCategory={subCategory}
            onCategoryChange={setCategory}
            onSubCategoryChange={setSubCategory}
          />
        </div>

        <div className="lg:col-span-3">
          <div className="space-y-3 mb-4">
            <ItemSearchBar value={query} onChange={setQuery} />

            <div className="flex flex-wrap gap-3">
              <select
                value={job}
                onChange={(e) => setJob(e.target.value)}
                className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="">All Jobs</option>
                {JOBS.map((j) => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
              <input
                type="number"
                placeholder="Min Lv"
                value={minLevel}
                onChange={(e) => setMinLevel(e.target.value)}
                className="w-20 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              />
              <input
                type="number"
                placeholder="Max Lv"
                value={maxLevel}
                onChange={(e) => setMaxLevel(e.target.value)}
                className="w-20 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <StatFilterPanel filters={statFilters} onChange={setStatFilters} />
          </div>

          {/* Sort + View toggle bar */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); setSortDir('asc') }}
                className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                {sortOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                onClick={() => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
              </button>
            </div>

            <div className="flex gap-1">
              <button
                onClick={() => setViewMode('cards')}
                title="Card view"
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'cards' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                title="Table view"
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'table' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-gray-400">Loading items...</p>
          ) : result && result.items.length > 0 ? (
            <>
              {viewMode === 'cards' ? (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {result.items.map((item) => (
                    <ItemCard key={item.itemId} item={item} />
                  ))}
                </div>
              ) : (
                <ItemTable
                  items={result.items}
                  statFilters={statFilters}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              )}

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
      </div>
    </div>
  )
}
