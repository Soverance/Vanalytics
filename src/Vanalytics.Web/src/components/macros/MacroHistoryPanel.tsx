import { useState, useEffect } from 'react'
import { getMacroBookHistory, restoreMacroBook } from '../../api/macros'
import type { MacroBookSnapshotSummary, MacroBookDetail } from '../../api/macros'
import ConfirmModal from '../ConfirmModal'

interface MacroHistoryPanelProps {
  characterId: string
  bookNumber: number
  onRestore: (detail: MacroBookDetail) => void
  onClose: () => void
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function reasonBadge(reason: string) {
  const colors: Record<string, string> = {
    'addon push': 'bg-blue-900 text-blue-300',
    'web edit': 'bg-yellow-900 text-yellow-300',
    'restore': 'bg-green-900 text-green-300',
  }
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${colors[reason] || 'bg-gray-700 text-gray-300'}`}>
      {reason}
    </span>
  )
}

export default function MacroHistoryPanel({ characterId, bookNumber, onRestore, onClose }: MacroHistoryPanelProps) {
  const [snapshots, setSnapshots] = useState<MacroBookSnapshotSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [restoreTarget, setRestoreTarget] = useState<MacroBookSnapshotSummary | null>(null)

  useEffect(() => {
    setLoading(true)
    setError('')
    getMacroBookHistory(characterId, bookNumber)
      .then(setSnapshots)
      .catch(() => setError('Failed to load history'))
      .finally(() => setLoading(false))
  }, [characterId, bookNumber])

  const handleRestore = async (snapshot: MacroBookSnapshotSummary) => {
    try {
      const detail = await restoreMacroBook(characterId, bookNumber, snapshot.id)
      onRestore(detail)
      setRestoreTarget(null)
      const updated = await getMacroBookHistory(characterId, bookNumber)
      setSnapshots(updated)
    } catch {
      setError('Failed to restore snapshot')
    }
  }

  return (
    <div className="w-80 border border-gray-700 rounded-lg p-4 bg-gray-900">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-200">Version History</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">&times;</button>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!loading && snapshots.length === 0 && (
        <p className="text-sm text-gray-500">No version history yet.</p>
      )}

      <div className="space-y-2">
        {snapshots.map(s => (
          <div key={s.id} className="border border-gray-700 rounded p-2 bg-gray-800">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">{formatRelativeTime(s.createdAt)}</span>
              {reasonBadge(s.reason)}
            </div>
            {s.bookTitle && (
              <p className="text-xs text-gray-400 mb-1">{s.bookTitle}</p>
            )}
            <button
              onClick={() => setRestoreTarget(s)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Restore
            </button>
          </div>
        ))}
      </div>

      {restoreTarget && (
        <ConfirmModal
          message={`Restore Book ${bookNumber} to version from ${new Date(restoreTarget.createdAt).toLocaleString()}? The current state will be saved to history first.`}
          confirmLabel="Restore"
          onConfirm={() => handleRestore(restoreTarget)}
          onCancel={() => setRestoreTarget(null)}
        />
      )}
    </div>
  )
}
