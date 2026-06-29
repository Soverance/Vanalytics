import { CHAT_COLORS } from './blueprintGraph'

// Friendly add_to_chat editor. The message is a typed DISPLAY string (acceptable exception — a typo is
// cosmetic, it can't break a gear branch). The color is picked from a curated list, never typed.
export default function PrintInspector({ text, color, onChange }: {
  text: string | null | undefined
  color: number | null | undefined
  onChange: (patch: { chatText?: string; chatColor?: number }) => void
}) {
  return (
    <div className="w-72 flex-none overflow-auto border-l border-gray-800 bg-gray-900 p-4">
      <h4 className="mb-2 text-[11px] uppercase tracking-wide text-gray-500">Print to chat</h4>

      <label className="mb-1 block text-xs text-gray-400">Message</label>
      <input value={text ?? ''} onChange={e => onChange({ chatText: e.target.value })}
        placeholder="Engaged!"
        className="mb-3 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200 placeholder-gray-600 outline-none" />

      <label className="mb-1 block text-xs text-gray-400">Color</label>
      <select value={color ?? CHAT_COLORS[0].code}
        onChange={e => onChange({ chatColor: Number(e.target.value) })}
        className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
        {CHAT_COLORS.map(c => <option key={c.code} value={c.code}>{c.label} ({c.code})</option>)}
      </select>
    </div>
  )
}
