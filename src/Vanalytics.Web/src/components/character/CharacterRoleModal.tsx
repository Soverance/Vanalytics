import { CHARACTER_ROLES } from '../../lib/characterRoles'

interface CharacterRoleModalProps {
  current: string
  onSelect: (role: string) => void
  onClose: () => void
}

// Owner-only "Character Type" picker. Mirrors the Share modal in CharacterDetailPage:
// a fixed overlay that closes on backdrop click, an inner card that stops propagation,
// and immediate-apply on selection (no separate Save). Selecting a row calls onSelect
// with the role enum name; "Clear (Unlabeled)" passes 'None'.
export default function CharacterRoleModal({ current, onSelect, onClose }: CharacterRoleModalProps) {
  const rows = [
    ...CHARACTER_ROLES.map(r => ({ value: r.value, label: r.label })),
    { value: 'None', label: 'Clear (Unlabeled)' },
  ]
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full mx-4"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-2">Character Type</h2>
        <p className="text-sm text-gray-400 mb-4">
          Label this character's role in your account.
        </p>
        <div className="space-y-1">
          {rows.map(row => {
            const active = current === row.value
            return (
              <button
                key={row.value}
                onClick={() => onSelect(row.value)}
                className={`flex w-full items-center justify-between rounded border px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'border-blue-600 bg-blue-900/30 text-blue-300'
                    : 'border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700'
                }`}
              >
                <span>{row.label}</span>
                {active && <span aria-hidden>✓</span>}
              </button>
            )
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded bg-gray-800 px-4 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
