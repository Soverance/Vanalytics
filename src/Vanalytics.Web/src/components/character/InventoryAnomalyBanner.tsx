import { useState, useEffect, useRef } from 'react'
import { api } from '../../api/client'
import type { AnomalyResponse, Anomaly } from '../../types/api'

interface InventoryAnomalyBannerProps {
  characterId: string
  onAnomalyCountChange?: (count: number) => void
}

const BAG_OPTIONS = [
  'Inventory', 'Safe', 'Safe2', 'Storage', 'Locker',
  'Satchel', 'Sack', 'Case',
  'Wardrobe', 'Wardrobe2', 'Wardrobe3', 'Wardrobe4',
  'Wardrobe5', 'Wardrobe6', 'Wardrobe7', 'Wardrobe8',
]

const BAG_LABELS: Record<string, string> = {
  Inventory: 'Inventory',
  Safe: 'Mog Safe',
  Safe2: 'Mog Safe 2',
  Storage: 'Storage',
  Locker: 'Mog Locker',
  Satchel: 'Mog Satchel',
  Sack: 'Mog Sack',
  Case: 'Mog Case',
  Wardrobe: 'Mog Wardrobe 1',
  Wardrobe2: 'Mog Wardrobe 2',
  Wardrobe3: 'Mog Wardrobe 3',
  Wardrobe4: 'Mog Wardrobe 4',
  Wardrobe5: 'Mog Wardrobe 5',
  Wardrobe6: 'Mog Wardrobe 6',
  Wardrobe7: 'Mog Wardrobe 7',
  Wardrobe8: 'Mog Wardrobe 8',
}

const bagLabel = (key: string) => BAG_LABELS[key] ?? key

export default function InventoryAnomalyBanner({ characterId, onAnomalyCountChange }: InventoryAnomalyBannerProps) {
  const [data, setData] = useState<AnomalyResponse | null>(null)
  const [showDismissed, setShowDismissed] = useState(false)
  const [overrideBags, setOverrideBags] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const initialLoadRef = useRef(true)
  const fetchAnomalies = () => {
    if (initialLoadRef.current) setLoading(true)
    api<AnomalyResponse>(`/api/characters/${characterId}/inventory/anomalies`)
      .then(data => {
        setData(data)
        onAnomalyCountChange?.(data.anomalies.length)
      })
      .catch(() => setData(null))
      .finally(() => { setLoading(false); initialLoadRef.current = false })
  }

  useEffect(() => { fetchAnomalies() }, [characterId])

  // Poll every 15 seconds to pick up move completions from the addon
  useEffect(() => {
    const id = setInterval(fetchAnomalies, 15000)
    return () => clearInterval(id)
  }, [characterId])

  const handleIgnoreItem = async (itemId: number) => {
    await api(`/api/characters/${characterId}/inventory/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anomalyKey: `ignoreItem:${itemId}` }),
    })
    fetchAnomalies()
  }

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

  if (loading) return <p className="text-gray-400 text-sm py-4">Checking for anomalies...</p>
  if (!data) return <p className="text-gray-500 text-sm py-4">Failed to load anomaly data.</p>

  const hasAnomalies = data.anomalies.length > 0
  const hasPending = data.pendingMoves.length > 0
  const hasDismissed = data.dismissedCount > 0

  return (
    <div className="space-y-3">
      {/* Pending moves */}
      {hasPending && (
        <div className="rounded-lg border border-blue-800 bg-blue-950/30 p-3">
          <h4 className="text-sm font-medium text-blue-400 mb-2">
            Pending Moves ({data.pendingMoves.length})
          </h4>
          <div className="space-y-1">
            {data.pendingMoves.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-300">
                  {m.itemName}: {bagLabel(m.fromBag)}:{m.fromSlot} → {bagLabel(m.toBag)} (x{m.quantity})
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

      {/* Active anomalies */}
      {hasAnomalies ? (
        <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-3">
          <h4 className="text-sm font-medium text-amber-400 mb-2">
            {data.anomalies.length} inventory issue{data.anomalies.length !== 1 ? 's' : ''} found
          </h4>
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
                onIgnoreItem={a.itemId != null ? () => handleIgnoreItem(a.itemId!) : undefined}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-green-800/50 bg-green-950/20 p-4">
          <p className="text-sm text-green-400">No inventory anomalies detected.</p>
          <p className="text-xs text-gray-500 mt-1">
            Your inventory is optimized — no duplicate or consolidatable items found.
          </p>
        </div>
      )}

      {/* Dismissed anomalies — always accessible */}
      {hasDismissed && (
        <div>
          <button
            onClick={() => setShowDismissed(!showDismissed)}
            className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
          >
            {data.dismissedCount} dismissed anomal{data.dismissedCount !== 1 ? 'ies' : 'y'} {showDismissed ? '▴' : '▾'}
          </button>
          {showDismissed && (
            <div className="mt-2">
              <DismissedList dismissedKeys={data.dismissedKeys} onUndismiss={handleUndismiss} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AnomalyCard({ anomaly, overrideBag, onOverrideBag, onResolve, onDismiss, onIgnoreItem }: {
  anomaly: Anomaly
  overrideBag: string | undefined
  onOverrideBag: (bag: string) => void
  onResolve: () => void
  onDismiss: () => void
  onIgnoreItem?: () => void
}) {
  if (anomaly.type === 'nearCapacity') {
    return (
      <div className="flex items-center justify-between text-sm border-b border-amber-900/50 pb-2">
        <span className="text-gray-300">
          <span className="text-amber-400 font-medium">{bagLabel(anomaly.details.bagName ?? '')}</span>: {anomaly.details.usedSlots}/{anomaly.details.maxSlots} slots used ({Math.round((anomaly.details.usedSlots! / anomaly.details.maxSlots!) * 100)}%)
        </span>
        <button onClick={onDismiss} className="text-xs text-gray-500 hover:text-gray-400">Dismiss</button>
      </div>
    )
  }

  const typeLabel = 'Duplicate'
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
                {bagLabel(s.bag)} slot {s.slotIndex} (x{s.quantity})
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {anomaly.type === 'duplicate' && anomaly.isEquipment && onIgnoreItem && (
            <button onClick={onIgnoreItem} className="text-xs text-blue-400 hover:text-blue-300">Always Ignore</button>
          )}
          <button onClick={onDismiss} className="text-xs text-gray-500 hover:text-gray-400">Dismiss</button>
        </div>
      </div>
      {anomaly.type === 'duplicate' && anomaly.isEquipment && (
        <p className="text-xs text-gray-600 mt-1">Items with different augments may appear as duplicates.</p>
      )}
      {anomaly.suggestedFix && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-gray-500 text-xs">Consolidate to:</span>
          <select
            value={targetBag}
            onChange={(e) => onOverrideBag(e.target.value)}
            className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300"
          >
            {BAG_OPTIONS.map((b) => (
              <option key={b} value={b}>{bagLabel(b)}</option>
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
  dismissedKeys: { key: string; label: string }[]
  onUndismiss: (key: string) => void
}) {
  if (dismissedKeys.length === 0) return null

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
      <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Dismissed</h4>
      <div className="space-y-1">
        {dismissedKeys.map((entry) => (
          <div key={entry.key} className="flex items-center justify-between text-sm">
            <span className="text-gray-500">{entry.label}</span>
            <button
              onClick={() => onUndismiss(entry.key)}
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
