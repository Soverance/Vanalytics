import { useState, useEffect } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

interface ConfirmModalProps {
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'default' | 'danger'
  confirmText?: string
  /** While true, both buttons are disabled, the confirm button shows a spinner with
   * busyLabel, and Escape/backdrop clicks are ignored so the dialog can't be dismissed
   * mid-operation. */
  busy?: boolean
  busyLabel?: string
}

export default function ConfirmModal({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  variant = 'default',
  confirmText,
  busy = false,
  busyLabel,
}: ConfirmModalProps) {
  const [typed, setTyped] = useState('')
  const isDanger = variant === 'danger'
  const needsTyping = isDanger && confirmText
  const canConfirm = (needsTyping ? typed === confirmText : true) && !busy
  const dismiss = () => { if (!busy) onCancel() }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel, busy])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={dismiss}
    >
      <div
        className={`rounded-lg p-6 max-w-md w-full mx-4 ${
          isDanger
            ? 'bg-gray-900 border border-red-700'
            : 'bg-gray-900 border border-gray-700'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {isDanger && (
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
            <span className="text-sm font-semibold text-red-400">Dangerous Action</span>
          </div>
        )}

        <p className="text-gray-200 text-sm mb-4">{message}</p>

        {isDanger && (
          <p className="text-xs text-red-400 mb-4">This cannot be undone.</p>
        )}

        {needsTyping && (
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">
              Type <span className="font-mono text-gray-300">{confirmText}</span> to confirm
            </label>
            <input
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              disabled={busy}
              className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-red-600 focus:outline-none"
              autoFocus
            />
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              isDanger
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
