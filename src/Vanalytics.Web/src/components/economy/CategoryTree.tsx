import { useState } from 'react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'

// Each browse category maps to API filter: category + subCategory
interface FilterSet {
  category?: string
  subCategory?: string
}

interface BrowseSubcategory {
  label: string
  filters: FilterSet
}

interface BrowseCategory {
  label: string
  filters?: FilterSet
  subcategories?: BrowseSubcategory[]
}

// Player-friendly browse hierarchy — subcategories match the SubCategory field computed during import
const BROWSE_CATEGORIES: BrowseCategory[] = [
  {
    label: 'Weapons',
    filters: { category: 'Weapon' },
    subcategories: [
      { label: 'Hand-to-Hand', filters: { category: 'Weapon', subCategory: 'Hand-to-Hand' } },
      { label: 'Daggers', filters: { category: 'Weapon', subCategory: 'Daggers' } },
      { label: 'Swords', filters: { category: 'Weapon', subCategory: 'Swords' } },
      { label: 'Great Swords', filters: { category: 'Weapon', subCategory: 'Great Swords' } },
      { label: 'Axes', filters: { category: 'Weapon', subCategory: 'Axes' } },
      { label: 'Great Axes', filters: { category: 'Weapon', subCategory: 'Great Axes' } },
      { label: 'Scythes', filters: { category: 'Weapon', subCategory: 'Scythes' } },
      { label: 'Polearms', filters: { category: 'Weapon', subCategory: 'Polearms' } },
      { label: 'Katana', filters: { category: 'Weapon', subCategory: 'Katana' } },
      { label: 'Great Katana', filters: { category: 'Weapon', subCategory: 'Great Katana' } },
      { label: 'Clubs', filters: { category: 'Weapon', subCategory: 'Clubs' } },
      { label: 'Staves', filters: { category: 'Weapon', subCategory: 'Staves' } },
      { label: 'Archery', filters: { category: 'Weapon', subCategory: 'Archery' } },
      { label: 'Marksmanship', filters: { category: 'Weapon', subCategory: 'Marksmanship' } },
    ],
  },
  {
    label: 'Armor',
    filters: { category: 'Armor' },
    subcategories: [
      { label: 'Shields', filters: { category: 'Armor', subCategory: 'Shields' } },
      { label: 'Head', filters: { category: 'Armor', subCategory: 'Head' } },
      { label: 'Neck', filters: { category: 'Armor', subCategory: 'Neck' } },
      { label: 'Body', filters: { category: 'Armor', subCategory: 'Body' } },
      { label: 'Hands', filters: { category: 'Armor', subCategory: 'Hands' } },
      { label: 'Waist', filters: { category: 'Armor', subCategory: 'Waist' } },
      { label: 'Legs', filters: { category: 'Armor', subCategory: 'Legs' } },
      { label: 'Feet', filters: { category: 'Armor', subCategory: 'Feet' } },
      { label: 'Back', filters: { category: 'Armor', subCategory: 'Back' } },
      { label: 'Earrings', filters: { category: 'Armor', subCategory: 'Earrings' } },
      { label: 'Rings', filters: { category: 'Armor', subCategory: 'Rings' } },
    ],
  },
  { label: 'Scrolls', filters: { subCategory: 'Scrolls' } },
  { label: 'Medicines', filters: { subCategory: 'Medicines' } },
  { label: 'Food', filters: { subCategory: 'Food' } },
  { label: 'Fish', filters: { subCategory: 'Fish' } },
  { label: 'Crystals', filters: { subCategory: 'Crystals' } },
  { label: 'Furnishings', filters: { subCategory: 'Furnishings' } },
  { label: 'Materials', filters: { subCategory: 'Materials' } },
  { label: 'Ninja Tools', filters: { subCategory: 'Ninja Tools' } },
  { label: 'Automaton', filters: { subCategory: 'Automaton' } },
  { label: 'Misc', filters: { subCategory: 'Misc' } },
]

interface CategoryTreeProps {
  selectedCategory: string
  selectedSubCategory: string
  onCategoryChange: (category: string) => void
  onSubCategoryChange: (subCategory: string) => void
}

function filtersMatch(f: FilterSet, category: string, subCategory: string): boolean {
  return (f.category || '') === category && (f.subCategory || '') === subCategory
}

export default function CategoryTree({
  selectedCategory, selectedSubCategory,
  onCategoryChange, onSubCategoryChange,
}: CategoryTreeProps) {
  const [expanded, setExpanded] = useState<string | null>(() => {
    for (const cat of BROWSE_CATEGORIES) {
      if (cat.subcategories && cat.filters?.category === selectedCategory) return cat.label
    }
    return null
  })

  const applyFilters = (filters: FilterSet) => {
    onCategoryChange(filters.category || '')
    onSubCategoryChange(filters.subCategory || '')
  }

  const clearAll = () => {
    onCategoryChange('')
    onSubCategoryChange('')
    setExpanded(null)
  }

  const isAnySelected = selectedCategory !== '' || selectedSubCategory !== ''

  const isActive = (filters?: FilterSet) => {
    if (!filters) return false
    return filtersMatch(filters, selectedCategory, selectedSubCategory)
  }

  const isParentActive = (filters?: FilterSet) => {
    if (!filters) return false
    return (filters.category || '') === selectedCategory
  }

  const handleCategoryClick = (cat: BrowseCategory) => {
    if (cat.subcategories) {
      setExpanded(expanded === cat.label ? null : cat.label)
      if (cat.filters) applyFilters(cat.filters)
    } else if (cat.filters) {
      setExpanded(null)
      if (isActive(cat.filters)) clearAll()
      else applyFilters(cat.filters)
    } else {
      clearAll()
    }
  }

  const handleSubcategoryClick = (sub: BrowseSubcategory, parent: BrowseCategory) => {
    if (isActive(sub.filters)) {
      if (parent.filters) applyFilters(parent.filters)
    } else {
      applyFilters(sub.filters)
    }
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Browse</span>
        {isAnySelected && (
          <button onClick={clearAll} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>
      <div>
        {BROWSE_CATEGORIES.map((cat) => {
          const isExpanded = expanded === cat.label
          const hasSubs = !!cat.subcategories
          const parentActive = isParentActive(cat.filters)
          const exactActive = isActive(cat.filters)
          const highlighted = exactActive || (parentActive && hasSubs)

          return (
            <div key={cat.label}>
              <button
                onClick={() => handleCategoryClick(cat)}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left transition-colors ${
                  highlighted && (!hasSubs || !selectedSubCategory)
                    ? 'bg-blue-600/20 text-blue-400'
                    : highlighted
                    ? 'text-blue-300'
                    : 'text-gray-300 hover:bg-gray-700/50'
                }`}
              >
                {hasSubs ? (
                  isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                             : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}
                <span className="truncate">{cat.label}</span>
              </button>

              {hasSubs && isExpanded && (
                <div className="ml-6 border-l border-gray-700 pl-2">
                  {cat.subcategories!.map((sub) => (
                    <button
                      key={sub.label}
                      onClick={() => handleSubcategoryClick(sub, cat)}
                      className={`block w-full px-2 py-1 text-xs text-left transition-colors ${
                        isActive(sub.filters)
                          ? 'bg-blue-600/20 text-blue-400'
                          : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'
                      }`}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
