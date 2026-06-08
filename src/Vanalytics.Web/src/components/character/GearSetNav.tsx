import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { JobNode } from './gearSetFilters'

interface Props {
  tree: JobNode[]
  selectedJob: string | null
  selectedCategory: string | null
  onSelect: (job: string | null, category: string | null) => void
}

export default function GearSetNav({ tree, selectedJob, selectedCategory, onSelect }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (job: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(job)) next.delete(job)
      else next.add(job)
      return next
    })

  if (tree.length === 0)
    return <div className="text-[11px] text-gray-500 p-2">No gear sets yet.</div>

  return (
    <div className="text-xs space-y-0.5">
      <button
        onClick={() => onSelect(null, null)}
        className={`w-full text-left px-2 py-1 rounded ${
          selectedJob == null ? 'bg-indigo-900/40 text-amber-200' : 'text-gray-300 hover:bg-gray-800/50'}`}>
        All sets
      </button>
      {tree.map(node => {
        const isOpen = expanded.has(node.job) || selectedJob === node.job
        const jobSelected = selectedJob === node.job && selectedCategory == null
        return (
          <div key={node.job}>
            <div className={`flex items-center rounded ${jobSelected ? 'bg-indigo-900/40' : 'hover:bg-gray-800/50'}`}>
              <button onClick={() => toggle(node.job)} className="p-1 text-gray-500" title="Expand/collapse">
                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              <button
                onClick={() => onSelect(node.job, null)}
                className={`flex-1 text-left py-1 pr-2 ${jobSelected ? 'text-amber-200' : 'text-gray-300'}`}>
                {node.label}
                <span className="ml-1.5 text-[10px] text-gray-500">({node.count})</span>
              </button>
            </div>
            {isOpen && node.categories.map(cat => {
              const catSelected = selectedJob === node.job && selectedCategory === cat.category
              return (
                <button key={cat.category}
                  onClick={() => onSelect(node.job, cat.category)}
                  className={`w-full text-left pl-7 pr-2 py-1 rounded ${
                    catSelected ? 'bg-indigo-900/40 text-amber-200' : 'text-gray-400 hover:bg-gray-800/50'}`}>
                  {cat.label}
                  <span className="ml-1.5 text-[10px] text-gray-500">({cat.count})</span>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
