import { useState } from 'react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'

// Each browse category maps to a combination of API filters (category, skill, slots, type)
interface FilterSet {
  category?: string
  skill?: string
  slots?: string
  type?: string
}

interface BrowseSubcategory {
  label: string
  filters: FilterSet
}

interface BrowseCategory {
  label: string
  filters?: FilterSet  // if clicking the top-level category itself should filter
  subcategories?: BrowseSubcategory[]
}

// FFXIAH-style category hierarchy, mapped to Windower data fields
const BROWSE_CATEGORIES: BrowseCategory[] = [
  {
    label: 'Weapons',
    filters: { category: 'Weapon' },
    subcategories: [
      { label: 'Hand-to-Hand', filters: { category: 'Weapon', skill: '1' } },
      { label: 'Daggers', filters: { category: 'Weapon', skill: '2' } },
      { label: 'Swords', filters: { category: 'Weapon', skill: '3' } },
      { label: 'Great Swords', filters: { category: 'Weapon', skill: '4' } },
      { label: 'Axes', filters: { category: 'Weapon', skill: '5' } },
      { label: 'Great Axes', filters: { category: 'Weapon', skill: '6' } },
      { label: 'Scythes', filters: { category: 'Weapon', skill: '7' } },
      { label: 'Polearms', filters: { category: 'Weapon', skill: '8' } },
      { label: 'Katana', filters: { category: 'Weapon', skill: '9' } },
      { label: 'Great Katana', filters: { category: 'Weapon', skill: '10' } },
      { label: 'Clubs', filters: { category: 'Weapon', skill: '11' } },
      { label: 'Staves', filters: { category: 'Weapon', skill: '12' } },
      { label: 'Archery', filters: { category: 'Weapon', skill: '25' } },
      { label: 'Marksmanship', filters: { category: 'Weapon', skill: '26' } },
    ],
  },
  {
    label: 'Armor',
    filters: { category: 'Armor' },
    subcategories: [
      { label: 'Shields', filters: { category: 'Armor', slots: 'Sub' } },
      { label: 'Head', filters: { category: 'Armor', slots: 'Head' } },
      { label: 'Neck', filters: { category: 'Armor', slots: 'Neck' } },
      { label: 'Body', filters: { category: 'Armor', slots: 'Body' } },
      { label: 'Hands', filters: { category: 'Armor', slots: 'Hands' } },
      { label: 'Waist', filters: { category: 'Armor', slots: 'Waist' } },
      { label: 'Legs', filters: { category: 'Armor', slots: 'Legs' } },
      { label: 'Feet', filters: { category: 'Armor', slots: 'Feet' } },
      { label: 'Back', filters: { category: 'Armor', slots: 'Back' } },
      { label: 'Earrings', filters: { category: 'Armor', slots: 'Ear' } },
      { label: 'Rings', filters: { category: 'Armor', slots: 'Ring' } },
    ],
  },
  {
    label: 'Scrolls',
    filters: { category: 'Usable', type: '7' },
  },
  {
    label: 'Medicines',
    filters: { category: 'Usable', type: '2' },
  },
  {
    label: 'Crystals',
    filters: { category: 'Usable', type: '8' },
  },
  {
    label: 'Food',
    filters: { category: 'Usable', type: '1' },
  },
  {
    label: 'Furnishings',
    filters: { category: 'General', type: '10' },
  },
  {
    label: 'Materials',
    filters: { category: 'General', type: '1' },
  },
  {
    label: 'Automaton',
    filters: { category: 'Automaton' },
  },
  {
    label: 'Others',
    // No filter — shows everything not covered above (or user can search within)
  },
]

interface CategoryTreeProps {
  selectedCategory: string
  selectedSkill: string
  selectedSlots: string
  selectedType: string
  onCategoryChange: (category: string) => void
  onSkillChange: (skill: string) => void
  onSlotsChange: (slots: string) => void
  onTypeChange: (type: string) => void
}

function filtersMatch(a: FilterSet, category: string, skill: string, slots: string, type: string): boolean {
  return (a.category || '') === category
    && (a.skill || '') === skill
    && (a.slots || '') === slots
    && (a.type || '') === type
}

export default function CategoryTree({
  selectedCategory, selectedSkill, selectedSlots, selectedType,
  onCategoryChange, onSkillChange, onSlotsChange, onTypeChange,
}: CategoryTreeProps) {
  const [expanded, setExpanded] = useState<string | null>(() => {
    // Auto-expand the category that matches current filters
    for (const cat of BROWSE_CATEGORIES) {
      if (cat.subcategories && cat.filters?.category === selectedCategory) return cat.label
    }
    return null
  })

  const applyFilters = (filters: FilterSet) => {
    onCategoryChange(filters.category || '')
    onSkillChange(filters.skill || '')
    onSlotsChange(filters.slots || '')
    onTypeChange(filters.type || '')
  }

  const clearAll = () => {
    onCategoryChange('')
    onSkillChange('')
    onSlotsChange('')
    onTypeChange('')
    setExpanded(null)
  }

  const isAnySelected = selectedCategory !== '' || selectedType !== ''

  // Check if a specific filter set is currently active
  const isActive = (filters?: FilterSet) => {
    if (!filters) return false
    return filtersMatch(filters, selectedCategory, selectedSkill, selectedSlots, selectedType)
  }

  // Check if a parent category is active (its filters match, ignoring subcategory-specific fields)
  const isParentActive = (filters?: FilterSet) => {
    if (!filters) return false
    return (filters.category || '') === selectedCategory
      && (filters.type || '') === selectedType
  }

  const handleCategoryClick = (cat: BrowseCategory) => {
    if (cat.subcategories) {
      // Expandable: toggle expand + apply parent filter
      setExpanded(expanded === cat.label ? null : cat.label)
      if (cat.filters) applyFilters(cat.filters)
    } else if (cat.filters) {
      // Leaf: toggle selection
      setExpanded(null)
      if (isActive(cat.filters)) {
        clearAll()
      } else {
        applyFilters(cat.filters)
      }
    } else {
      // "Others" with no filter — clear everything
      clearAll()
    }
  }

  const handleSubcategoryClick = (sub: BrowseSubcategory) => {
    if (isActive(sub.filters)) {
      // Deselect subcategory, keep parent
      const parent = BROWSE_CATEGORIES.find(c => c.subcategories?.includes(sub))
      if (parent?.filters) applyFilters(parent.filters)
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
          const hasSubcategories = !!cat.subcategories
          const parentActive = isParentActive(cat.filters)
          const exactActive = isActive(cat.filters)
          // Parent is highlighted if exact match or any subcategory matches
          const highlighted = exactActive || (parentActive && hasSubcategories)

          return (
            <div key={cat.label}>
              <button
                onClick={() => handleCategoryClick(cat)}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left transition-colors ${
                  highlighted && (!hasSubcategories || (hasSubcategories && !selectedSkill && !selectedSlots))
                    ? 'bg-blue-600/20 text-blue-400'
                    : highlighted
                    ? 'text-blue-300'
                    : 'text-gray-300 hover:bg-gray-700/50'
                }`}
              >
                {hasSubcategories ? (
                  isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                             : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}
                <span className="truncate">{cat.label}</span>
              </button>

              {hasSubcategories && isExpanded && (
                <div className="ml-6 border-l border-gray-700 pl-2">
                  {cat.subcategories!.map((sub) => (
                    <button
                      key={sub.label}
                      onClick={() => handleSubcategoryClick(sub)}
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
