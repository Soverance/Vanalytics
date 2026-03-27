import { useState, useEffect } from 'react'
import { api } from '../../api/client'
import type { AnomalyResponse, Anomaly } from '../../types/api'

interface InventoryAnomalyBannerProps {
  characterId: string
}

const BAG_OPTIONS = [
  'Inventory', 'Safe', 'Storage', 'Locker',
  'Satchel', 'Sack', 'Case',
  'Wardrobe', 'Wardrobe2', 'Wardrobe3', 'Wardrobe4',
  'Wardrobe5', 'Wardrobe6', 'Wardrobe7', 'Wardrobe8',
]

export default function InventoryAnomalyBanner({ characterId }: InventoryAnomalyBannerProps) {
  const [data, setData] = useState<AnomalyResponse | null>(null)
  const [showDismissed, setShowDismissed] = useState(false)
  const [overrideBags, setOverrideBags] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const fetchAnomalies = () => {
    setLoading(true)
    api<AnomalyResponse>(`/api/characters/${characterId}/inventory/anomalies`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAnomalies() }, [characterId])

  const handleDismiss = async (anomalyKey: string) => {
    await api(`/api/characters/${characterId}/inventory/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anomalyKey }),
    })
    fetchAnomalies()
  }

  const handleUndismiss = async (anomalyKey: string) => {
    await api(`/api/characters/${characterId}/inventory/dismiss/${encodeURIComponent(anomalyKey)}`, {
      method: 'DELETE',
    })
    fetchAnomalies()
  }

  const handleResolve = async (anomaly: Anomaly) => {
    if (!anomaly.suggestedFix) return
    const overrideBag = overrideBags[anomaly.anomalyKey]
    const moves = overrideBag
      ? anomaly.suggestedFix.moves.map(m => ({ ...m, toBag: overrideBag }))
      : anomaly.suggestedFix.moves

    await api(`/api/characters/${characterId}/inventory/moves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moves }),
    })
    fetchAnomalies()
  }

  const handleCancelMove = async (moveId: number) => {
    await api(`/api/characters/${characterId}/inventory/moves/${moveId}`, {
      method: 'DELETE',
    })
    fetchAnomalies()
  }

  if (loading || !data) return null
  if (data.anomalies.length === 0 && data.pendingMoves.length === 0 && data.dismissedCount === 0) return null

  return (
    <div className="mb-4 space-y-3">
      {data.pendingMoves.length > 0 && (
        <div className="rounded-lg border border-blue-800 bg-blue-950/30 p-3">
          <h4 className="text-sm font-medium text-blue-400 mb-2">
            Pending Moves ({data.pendingMoves.length})
          </h4>
          <div className="space-y-1">
            {data.pendingMoves.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-300">
                  {m.itemName}: {m.fromBag}:{m.fromSlot} → {m.toBag} (x{m.quantity})
                </span>
                <button
                  onClick={() => handleCancelMove(m.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.anomalies.length > 0 && (
        <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-amber-400">
              {data.anomalies.length} inventory issue{data.anomalies.length !== 1 ? 's' : ''} found
            </h4>
            {data.dismissedCount > 0 && (
              <button
                onClick={() => setShowDismissed(!showDismissed)}
                className="text-xs text-gray-500 hover:text-gray-400"
              >
                {data.dismissedCount} dismissed {showDismissed ? '▴' : '▾'}
              </button>
            )}
          </div>

          <div className="space-y-3">
            {data.anomalies.map((a) => (
              <AnomalyCard
                key={a.anomalyKey}
                anomaly={a}
                overrideBag={overrideBags[a.anomalyKey]}
                onOverrideBag={(bag) =>
                  setOverrideBags((prev) => ({ ...prev, [a.anomalyKey]: bag }))
                }
                onResolve={() => handleResolve(a)}
                onDismiss={() => handleDismiss(a.anomalyKey)}
              />
            ))}
          </div>
        </div>
      )}

      {showDismissed && data.dismissedKeys.length > 0 && (
        <DismissedList dismissedKeys={data.dismissedKeys} onUndismiss={handleUndismiss} />
      )}
    </div>
  )
}

function AnomalyCard({ anomaly, overrideBag, onOverrideBag, onResolve, onDismiss }: {
  anomaly: Anomaly
  overrideBag: string | undefined
  onOverrideBag: (bag: string) => void
  onResolve: () => void
  onDismiss: () => void
}) {
  if (anomaly.type === 'nearCapacity') {
    return (
      <div className="flex items-center justify-between text-sm border-b border-amber-900/50 pb-2">
        <span className="text-gray-300">
          <span className="text-amber-400 font-medium">{anomaly.details.bagName}</span>: {anomaly.details.usedSlots}/{anomaly.details.maxSlots} slots used ({Math.round((anomaly.details.usedSlots! / anomaly.details.maxSlots!) * 100)}%)
        </span>
        <button onClick={onDismiss} className="text-xs text-gray-500 hover:text-gray-400">Dismiss</button>
      </div>
    )
  }

  const typeLabel = anomaly.type === 'duplicate' ? 'Duplicate' : 'Split Stack'
  const targetBag = overrideBag || anomaly.suggestedFix?.moves[0]?.toBag || ''

  return (
    <div className="border-b border-amber-900/50 pb-2 text-sm">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-amber-300 font-medium">{typeLabel}: </span>
          <span className="text-gray-200">{anomaly.itemName}</span>
          <div className="text-gray-500 text-xs mt-1">
            {anomaly.details.slots?.map((s, i) => (
              <span key={i}>
                {i > 0 && ', '}
                {s.bag} slot {s.slotIndex} (x{s.quantity})
              </span>
            ))}
          </div>
        </div>
        <button onClick={onDismiss} className="text-xs text-gray-500 hover:text-gray-400 shrink-0">Dismiss</button>
      </div>
      {anomaly.suggestedFix && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-gray-500 text-xs">Consolidate to:</span>
          <select
            value={targetBag}
            onChange={(e) => onOverrideBag(e.target.value)}
            className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300"
          >
            {BAG_OPTIONS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <button
            onClick={onResolve}
            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded transition-colors"
          >
            Resolve
          </button>
        </div>
      )}
    </div>
  )
}

function DismissedList({ dismissedKeys, onUndismiss }: {
  dismissedKeys: string[]
  onUndismiss: (key: string) => void
}) {
  if (dismissedKeys.length === 0) return null

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
      <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Dismissed</h4>
      <div className="space-y-1">
        {dismissedKeys.map((key) => (
          <div key={key} className="flex items-center justify-between text-sm">
            <span className="text-gray-500">{key}</span>
            <button
              onClick={() => onUndismiss(key)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Un-dismiss
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
