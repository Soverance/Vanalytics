import { useState, useEffect } from 'react'
import type { MacroDetail } from '../../api/macros'

const SLASH_COMMANDS = [
  '/ma', '/ja', '/ws', '/pet', '/equip', '/wait',
  '/echo', '/p', '/l', '/s', '/sh', '/t', '/item',
  '/ra', '/range', '/shoot', '/jobchange', '/lockstyleset',
  '/dance', '/bow', '/kneel', '/wave', '/cheer', '/clap',
]

interface MacroEditorPanelProps {
  macro: MacroDetail
  onSave: (updated: MacroDetail) => void
  onClose: () => void
}

export default function MacroEditorPanel({ macro, onSave, onClose }: MacroEditorPanelProps) {
  const [name, setName] = useState(macro.name)
  const [icon, setIcon] = useState(macro.icon)
  const [lines, setLines] = useState([
    macro.line1, macro.line2, macro.line3,
    macro.line4, macro.line5, macro.line6,
  ])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [activeLine, setActiveLine] = useState<number | null>(null)

  useEffect(() => {
    setName(macro.name)
    setIcon(macro.icon)
    setLines([macro.line1, macro.line2, macro.line3, macro.line4, macro.line5, macro.line6])
  }, [macro])

  const updateLine = (index: number, value: string) => {
    const newLines = [...lines]
    newLines[index] = value
    setLines(newLines)

    if (value.startsWith('/')) {
      const prefix = value.split(' ')[0].toLowerCase()
      const matches = SLASH_COMMANDS.filter(c => c.startsWith(prefix) && c !== prefix)
      setSuggestions(matches.slice(0, 5))
      setActiveLine(index)
    } else {
      setSuggestions([])
      setActiveLine(null)
    }
  }

  const applySuggestion = (cmd: string) => {
    if (activeLine === null) return
    const newLines = [...lines]
    const rest = newLines[activeLine].includes(' ') ? newLines[activeLine].substring(newLines[activeLine].indexOf(' ')) : ' '
    newLines[activeLine] = cmd + rest
    setLines(newLines)
    setSuggestions([])
    setActiveLine(null)
  }

  const handleSave = () => {
    onSave({
      set: macro.set,
      position: macro.position,
      name,
      icon,
      line1: lines[0],
      line2: lines[1],
      line3: lines[2],
      line4: lines[3],
      line5: lines[4],
      line6: lines[5],
    })
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 w-80">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-200">
          {macro.set}+{macro.position}
        </h4>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-sm">&times;</button>
      </div>

      <div className="mb-3">
        <label className="block text-xs text-gray-500 mb-1">Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value.slice(0, 8))}
          maxLength={8}
          className="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
        />
        <div className="text-[10px] text-gray-600 mt-0.5">{name.length}/8</div>
      </div>

      <div className="mb-3">
        <label className="block text-xs text-gray-500 mb-1">Icon</label>
        <input
          type="number"
          min={0}
          max={255}
          value={icon}
          onChange={e => setIcon(Math.min(255, Math.max(0, parseInt(e.target.value) || 0)))}
          className="w-20 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="space-y-1.5 mb-4">
        <label className="block text-xs text-gray-500">Commands</label>
        {lines.map((line, i) => (
          <div key={i} className="relative">
            <input
              value={line}
              onChange={e => updateLine(i, e.target.value.slice(0, 57))}
              maxLength={57}
              placeholder={`Line ${i + 1}`}
              className="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-gray-200 font-mono focus:outline-none focus:border-blue-500"
            />
            {activeLine === i && suggestions.length > 0 && (
              <div className="absolute left-0 top-full z-20 mt-0.5 rounded border border-gray-700 bg-gray-800 shadow-lg">
                {suggestions.map(cmd => (
                  <button
                    key={cmd}
                    onClick={() => applySuggestion(cmd)}
                    className="block w-full text-left px-3 py-1 text-xs text-gray-300 hover:bg-gray-700 font-mono"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            )}
            <div className="text-[10px] text-gray-600 text-right">{line.length}/57</div>
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
      >
        Save
      </button>
    </div>
  )
}
