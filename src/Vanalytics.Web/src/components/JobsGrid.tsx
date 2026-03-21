import type { JobEntry } from '../types/api'

export default function JobsGrid({ jobs }: { jobs: JobEntry[] }) {
  if (jobs.length === 0) return <p className="text-gray-500 text-sm">No job data.</p>

  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
      {jobs.map((j) => (
        <div
          key={j.job}
          className={`rounded border px-2 py-1.5 text-center text-sm ${
            j.isActive
              ? 'border-blue-500 bg-blue-900/30 text-blue-300'
              : 'border-gray-700 bg-gray-800 text-gray-400'
          }`}
        >
          <div className="font-medium">{j.job}</div>
          <div className="text-xs">{j.level}</div>
        </div>
      ))}
    </div>
  )
}
