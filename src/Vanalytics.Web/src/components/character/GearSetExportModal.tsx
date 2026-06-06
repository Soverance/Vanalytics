import { useState } from 'react'
import { X, Copy, Check } from 'lucide-react'
import { toGearSwapLua, type GearSetSlot } from '../../utils/gearSwapExport'

interface Props {
  name: string
  slots: GearSetSlot[]
  onClose: () => void
}

export default function GearSetExportModal({ name, slots, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const lua = toGearSwapLua(name, slots)

  const copy = async () => {
    await navigator.clipboard.writeText(lua)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-900 border-2 border-amber-800/50 rounded-lg w-full max-w-lg mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <span className="text-sm text-gray-200">Export "{name}" to GearSwap</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-3">
          <pre className="bg-gray-950 border border-gray-800 rounded p-3 text-xs text-green-300 overflow-x-auto whitespace-pre">{lua}</pre>
          <div className="flex justify-end mt-3">
            <button onClick={copy}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-indigo-900/50 text-amber-200 border border-amber-700/40">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
