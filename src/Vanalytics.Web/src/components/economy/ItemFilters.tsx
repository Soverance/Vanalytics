// src/Vanalytics.Web/src/components/economy/ItemFilters.tsx
interface Props {
  categories: string[]
  selectedCategory: string
  onCategoryChange: (category: string) => void
  selectedJob: string
  onJobChange: (job: string) => void
  minLevel: string
  maxLevel: string
  onMinLevelChange: (val: string) => void
  onMaxLevelChange: (val: string) => void
  selectedSkill: string
  onSkillChange: (skill: string) => void
}

const JOBS = [
  '', 'WAR', 'MNK', 'WHM', 'BLM', 'RDM', 'THF', 'PLD', 'DRK', 'BST', 'BRD', 'RNG',
  'SAM', 'NIN', 'DRG', 'SMN', 'BLU', 'COR', 'PUP', 'DNC', 'SCH', 'GEO', 'RUN',
]

const WEAPON_TYPES: { id: number; name: string }[] = [
  { id: 1, name: 'Hand-to-Hand' }, { id: 2, name: 'Dagger' }, { id: 3, name: 'Sword' },
  { id: 4, name: 'Great Sword' }, { id: 5, name: 'Axe' }, { id: 6, name: 'Great Axe' },
  { id: 7, name: 'Scythe' }, { id: 8, name: 'Polearm' }, { id: 9, name: 'Katana' },
  { id: 10, name: 'Great Katana' }, { id: 11, name: 'Club' }, { id: 12, name: 'Staff' },
  { id: 25, name: 'Archery' }, { id: 26, name: 'Marksmanship' },
]

export default function ItemFilters({
  categories, selectedCategory, onCategoryChange,
  selectedJob, onJobChange,
  minLevel, maxLevel, onMinLevelChange, onMaxLevelChange,
  selectedSkill, onSkillChange,
}: Props) {
  return (
    <div className="flex flex-wrap gap-3">
      <select
        value={selectedCategory}
        onChange={(e) => onCategoryChange(e.target.value)}
        className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
      >
        <option value="">All Categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      {selectedCategory === 'Weapon' && (
        <select
          value={selectedSkill}
          onChange={(e) => onSkillChange(e.target.value)}
          className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Weapon Types</option>
          {WEAPON_TYPES.map((w) => (
            <option key={w.id} value={w.id.toString()}>{w.name}</option>
          ))}
        </select>
      )}

      <select
        value={selectedJob}
        onChange={(e) => onJobChange(e.target.value)}
        className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
      >
        <option value="">All Jobs</option>
        {JOBS.filter(j => j).map((j) => (
          <option key={j} value={j}>{j}</option>
        ))}
      </select>

      <input
        type="number"
        placeholder="Min Lv"
        value={minLevel}
        onChange={(e) => onMinLevelChange(e.target.value)}
        className="w-20 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
      />
      <input
        type="number"
        placeholder="Max Lv"
        value={maxLevel}
        onChange={(e) => onMaxLevelChange(e.target.value)}
        className="w-20 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
      />
    </div>
  )
}
