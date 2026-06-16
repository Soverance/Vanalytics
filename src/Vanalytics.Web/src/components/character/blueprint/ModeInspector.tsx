// src/Vanalytics.Web/src/components/character/blueprint/ModeInspector.tsx
import type { GearSetSummary, ModeMember } from '../../../types/api'

export default function ModeInspector({
  sets, name, command, members,
  onNameChange, onCommandChange, onAddMember, onRemoveMember, onMoveMember,
  onAddMemberOverlay, onRemoveMemberOverlay, onMoveMemberOverlay,
}: {
  sets: GearSetSummary[]
  name: string
  command: string
  members: ModeMember[]
  onNameChange: (v: string) => void
  onCommandChange: (v: string) => void
  onAddMember: (setId: number) => void
  onRemoveMember: (index: number) => void
  onMoveMember: (index: number, dir: -1 | 1) => void
  onAddMemberOverlay: (memberIndex: number, setId: number) => void
  onRemoveMemberOverlay: (memberIndex: number, overlayIndex: number) => void
  onMoveMemberOverlay: (memberIndex: number, overlayIndex: number, dir: -1 | 1) => void
}) {
  const setById = new Map(sets.map(s => [s.id, s]))
  return (
    <div className="w-72 flex-none overflow-auto border-l border-gray-800 bg-gray-900 p-4">
      <h4 className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">Mode</h4>

      <label className="mb-1 block text-xs text-gray-400">Name</label>
      <input
        value={name}
        onChange={e => onNameChange(e.target.value)}
        className="mb-3 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200"
      />

      <label className="mb-1 block text-xs text-gray-400">Members (first = default)</label>
      {members.length === 0 && <p className="mb-2 text-xs text-gray-500">No members yet.</p>}
      <ol className="mb-2 space-y-1">
        {members.map((m, i) => (
          <li key={i} className="rounded border border-gray-800 bg-gray-800/60 px-2 py-1 text-xs text-gray-200">
            <div className="flex items-center gap-1">
              <span className="text-gray-500">{i + 1}.</span>
              <span className="flex-1 truncate">{setById.get(m.gearSetId)?.name ?? `#${m.gearSetId}`}</span>
              {i === 0 && (
                <span className="rounded-full border border-emerald-700/50 bg-emerald-950/40 px-1.5 text-[9px] text-emerald-200">default</span>
              )}
              <button onClick={() => onMoveMember(i, -1)} disabled={i === 0} className="px-1 text-gray-400 disabled:opacity-30">↑</button>
              <button onClick={() => onMoveMember(i, 1)} disabled={i === members.length - 1} className="px-1 text-gray-400 disabled:opacity-30">↓</button>
              <button onClick={() => onRemoveMember(i)} className="px-1 text-rose-300">✕</button>
            </div>
            <div className="mt-1 pl-4">
              {(m.overlaySetIds ?? []).map((oid, oi) => (
                <div key={oi} className="flex items-center gap-1 text-[11px] text-gray-300">
                  <span className="flex-1 truncate">⊕ {setById.get(oid)?.name ?? `#${oid}`}</span>
                  <button onClick={() => onMoveMemberOverlay(i, oi, -1)} disabled={oi === 0} className="px-1 text-gray-400 disabled:opacity-30">↑</button>
                  <button onClick={() => onMoveMemberOverlay(i, oi, 1)} disabled={oi === ((m.overlaySetIds?.length ?? 0) - 1)} className="px-1 text-gray-400 disabled:opacity-30">↓</button>
                  <button onClick={() => onRemoveMemberOverlay(i, oi)} className="px-1 text-rose-300">✕</button>
                </div>
              ))}
              <select
                value=""
                onChange={e => { if (e.target.value) onAddMemberOverlay(i, Number(e.target.value)) }}
                className="mt-0.5 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] text-gray-200">
                <option value="">— add layer —</option>
                {sets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </li>
        ))}
      </ol>

      <label className="mb-1 block text-xs text-gray-400">Add a set</label>
      <select
        value=""
        onChange={e => { if (e.target.value) onAddMember(Number(e.target.value)) }}
        className="mb-3 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
        <option value="">— add a set —</option>
        {sets.map(s => (
          <option key={s.id} value={s.id}>
            {s.name}{s.category && s.category !== 'Other' ? ` (${s.category})` : ''}
          </option>
        ))}
      </select>

      <details className="text-xs text-gray-400">
        <summary className="cursor-pointer select-none">Advanced</summary>
        <label className="mb-1 mt-2 block">Macro command</label>
        <input
          value={command}
          onChange={e => onCommandChange(e.target.value)}
          className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-gray-200"
        />
        <p className="mt-1 text-[10px] text-gray-500">Bind in-game: /console gs c {command}</p>
      </details>

      {sets.length === 0 && (
        <p className="mt-3 text-xs text-amber-300">
          This job has no gear sets yet. Create some on the character's Gear Sets tab first.
        </p>
      )}
    </div>
  )
}
