import { useState } from 'react'
import type { JobEntry } from '../types/api'

const COL_LEFT = ['WAR', 'WHM', 'RDM', 'PLD', 'BST', 'RNG', 'NIN', 'SMN', 'COR', 'DNC', 'GEO']
const COL_RIGHT = ['MNK', 'BLM', 'THF', 'DRK', 'BRD', 'SAM', 'DRG', 'BLU', 'PUP', 'SCH', 'RUN']

function formatNumber(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString()
}

function JobRow({ abbr, job, showJP }: { abbr: string; job?: JobEntry; showJP: boolean }) {
  const level = job?.level ?? 0
  const isActive = job?.isActive ?? false

  return (
    <div className={`flex items-center px-2 py-0.5 text-sm border-b border-gray-800/50 ${
      isActive ? 'text-blue-300' : level > 0 ? 'text-gray-300' : 'text-gray-600'
    }`}>
      <span className="font-medium w-10">{abbr}</span>
      <span className="text-right w-8">{level}</span>
      {showJP && level > 0 && (
        <span className="text-right flex-1 text-xs text-gray-500 ml-2">
          {job!.jpSpent > 0 ? `${formatNumber(job!.jpSpent)} JP` : ''}
          {job!.cp > 0 ? ` · ${formatNumber(job!.cp)} CP` : ''}
        </span>
      )}
    </div>
  )
}

export default function JobsGrid({ jobs }: { jobs: JobEntry[] }) {
  if (jobs.length === 0) return <p className="text-gray-500 text-sm">No job data.</p>

  const [showJP, setShowJP] = useState(false)
  const jobMap = new Map(jobs.map(j => [j.job, j]))
  const hasAnyJP = jobs.some(j => j.jpSpent > 0 || j.cp > 0)

  return (
    <div>
      {hasAnyJP && (
        <button
          onClick={() => setShowJP(!showJP)}
          className="text-xs text-gray-500 hover:text-gray-300 mb-2"
        >
          {showJP ? 'Hide' : 'Show'} JP/CP
        </button>
      )}
      <div className={`flex gap-6 ${showJP ? 'max-w-lg' : 'max-w-sm'}`}>
        <div className="flex-1">
          {COL_LEFT.map(abbr => (
            <JobRow key={abbr} abbr={abbr} job={jobMap.get(abbr)} showJP={showJP} />
          ))}
        </div>
        <div className="flex-1">
          {COL_RIGHT.map(abbr => (
            <JobRow key={abbr} abbr={abbr} job={jobMap.get(abbr)} showJP={showJP} />
          ))}
        </div>
      </div>
    </div>
  )
}
