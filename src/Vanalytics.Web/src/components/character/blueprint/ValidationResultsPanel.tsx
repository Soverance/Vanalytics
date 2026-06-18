import { AlertCircle, AlertTriangle, X } from 'lucide-react'
import type { Diagnostic } from '../../../types/api'

interface Props {
  diagnostics: Diagnostic[]
  onJump: (nodeId: string) => void
  onClose: () => void
}

export default function ValidationResultsPanel({ diagnostics, onJump, onClose }: Props) {
  const errors = diagnostics.filter(d => d.severity === 'error').length
  const warnings = diagnostics.filter(d => d.severity === 'warning').length

  return (
    <div className="flex max-h-56 flex-none flex-col border-t border-gray-800 bg-[#0b0e13] text-xs">
      <div className="flex flex-none items-center gap-3 border-b border-gray-800 px-3 py-1.5">
        <span className="font-semibold text-gray-200">Compiler Results</span>
        <span className="text-rose-300">{errors} error{errors === 1 ? '' : 's'}</span>
        <span className="text-amber-300">{warnings} warning{warnings === 1 ? '' : 's'}</span>
        <button onClick={onClose} className="ml-auto text-gray-500 hover:text-gray-200" aria-label="Close results">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {diagnostics.map((d, i) => {
          const clickable = d.nodeId !== null
          return (
            <button
              key={i}
              disabled={!clickable}
              onClick={() => d.nodeId && onJump(d.nodeId)}
              className={`flex w-full items-start gap-2 px-3 py-1.5 text-left ${
                clickable ? 'hover:bg-gray-800/60 cursor-pointer' : 'cursor-default opacity-80'
              }`}
            >
              {d.severity === 'error'
                ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-none text-rose-400" />
                : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-amber-400" />}
              <span className="text-gray-200">{d.message}</span>
              {clickable && <span className="ml-auto flex-none text-[10px] text-gray-500">jump →</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
