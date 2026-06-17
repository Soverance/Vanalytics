// src/Vanalytics.Web/src/components/character/blueprint/ConnectMenu.tsx
import { GitBranch, Shield, Sparkles, Activity } from 'lucide-react'

export type ConnectMenuKind = 'exec' | 'cond'

export default function ConnectMenu({ x, y, kind, onPick, onClose }: {
  x: number; y: number
  kind: ConnectMenuKind
  onPick: (choice: 'branch' | 'equip' | 'cond:buff' | 'cond:stat') => void
  onClose: () => void
}) {
  const rows: { choice: 'branch' | 'equip' | 'cond:buff' | 'cond:stat'; label: string; Icon: typeof GitBranch }[] =
    kind === 'exec'
      ? [{ choice: 'branch', label: 'Branch (if/else)', Icon: GitBranch },
         { choice: 'equip', label: 'Equip Gear Set', Icon: Shield }]
      : [{ choice: 'cond:buff', label: 'Buff active', Icon: Sparkles },
         { choice: 'cond:stat', label: 'HP/MP/TP', Icon: Activity }]
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute z-20 w-48 overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-2xl"
        style={{ left: x, top: y }}>
        {rows.map(r => (
          <button key={r.choice} onClick={() => onPick(r.choice)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-200 hover:bg-gray-700">
            <r.Icon className="h-3.5 w-3.5" /> {r.label}
          </button>
        ))}
      </div>
    </>
  )
}
