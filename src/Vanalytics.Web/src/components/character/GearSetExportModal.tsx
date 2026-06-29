import { useState } from 'react'
import { X, Copy, Check, Download as DownloadIcon } from 'lucide-react'
import { toGearSwapLua, type GearSetSlot } from '../../utils/gearSwapExport'

interface Props {
  name: string
  slots?: GearSetSlot[]
  luaOverride?: string
  warnings?: string[]
  onClose: () => void
}

export default function GearSetExportModal({ name, slots, luaOverride, warnings, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const lua = luaOverride ?? (slots ? toGearSwapLua(name, slots) : '')
  const fileName = name.endsWith('.lua') ? name : `${name}.lua`
  const lineCount = lua ? lua.split('\n').length : 0
  const kb = (new Blob([lua]).size / 1024).toFixed(1)

  const copy = async () => {
    await navigator.clipboard.writeText(lua)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const download = () => {
    const blob = new Blob([lua], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border-2 border-amber-800/50 bg-gray-900"
        onClick={e => e.stopPropagation()}>
        {/* header (fixed) */}
        <div className="flex flex-none items-center justify-between border-b border-gray-800 px-4 py-3">
          <span className="text-sm text-gray-200">Export "{name}" to GearSwap</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="h-4 w-4" /></button>
        </div>

        {/* body: warnings (fixed) + scrollable code area */}
        <div className="flex min-h-0 flex-1 flex-col p-3">
          {warnings && warnings.length > 0 && (
            <div className="mb-2 flex-none rounded border border-amber-800/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
              {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}
          <pre className="styled-scrollbar min-h-0 flex-1 overflow-auto whitespace-pre rounded border border-gray-800 bg-gray-900 p-3 text-xs text-gray-200">{lua}</pre>
        </div>

        {/* footer (fixed): count + actions always visible */}
        <div className="flex flex-none items-center justify-between gap-2 border-t border-gray-800 px-4 py-3">
          <span className="text-[11px] text-gray-500">{lineCount} line{lineCount === 1 ? '' : 's'} · {kb} KB</span>
          <div className="flex gap-2">
            <button onClick={download}
              className="flex items-center gap-1.5 rounded border border-gray-700/40 bg-gray-800/60 px-3 py-1.5 text-xs text-gray-300">
              <DownloadIcon className="h-3.5 w-3.5" /> Download {fileName}
            </button>
            <button onClick={copy}
              className="flex items-center gap-1.5 rounded border border-amber-700/40 bg-indigo-900/50 px-3 py-1.5 text-xs text-amber-200">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
