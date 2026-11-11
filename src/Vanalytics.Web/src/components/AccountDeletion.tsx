import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { api, ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'

interface DeletionStatus {
  pending: boolean
  scheduledFor: string | null
}

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'long' }) : ''

/**
 * Self-service "Delete my account" dialog. The account is locked right away and deleted
 * after a 7-day grace period; signing back in before then offers to cancel
 * (see PendingDeletionGate).
 */
export function DeleteAccountModal({ username, onClose }: { username: string; onClose: () => void }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [scheduledFor, setScheduledFor] = useState<string | null>(null)

  const matches = typed.trim().toLowerCase() === username.toLowerCase()

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await api<DeletionStatus>('/api/account/deletion', {
        method: 'POST',
        body: JSON.stringify({ confirmUsername: typed }),
      })
      setScheduledFor(res.scheduledFor)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // The server has already revoked every session; finish by clearing this one.
  const done = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { if (!busy && !scheduledFor) onClose() }}>
      <div className="rounded-lg p-6 max-w-md w-full mx-4 bg-gray-900 border border-red-700" onClick={e => e.stopPropagation()}>
        {scheduledFor ? (
          <>
            <h2 className="text-lg font-semibold mb-3">Account scheduled for deletion</h2>
            <p className="text-sm text-gray-300 mb-3">
              Your account and all of its data will be permanently deleted on{' '}
              <span className="font-medium text-gray-100">{formatDate(scheduledFor)}</span>.
            </p>
            <p className="text-sm text-gray-400 mb-5">
              You've been signed out on every device and the addon has stopped syncing. Changed your mind?
              Sign in again before that date and you'll be able to cancel.
            </p>
            <div className="flex justify-end">
              <button onClick={done} className="rounded bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700">
                OK
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
              <h2 className="text-lg font-semibold text-red-400">Delete your account</h2>
            </div>
            <ul className="text-sm text-gray-300 mb-4 space-y-2 list-disc pl-5">
              <li>You'll be signed out everywhere and the Windower addon will stop syncing right away.</li>
              <li>After 7 days, your account, characters and all synced data are <span className="text-gray-100 font-medium">permanently deleted</span>.</li>
              <li>Until then you can cancel by signing back in.</li>
            </ul>

            {error && (
              <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">{error}</div>
            )}

            <label className="block text-xs text-gray-500 mb-1">
              Type your username <span className="font-mono text-gray-300">{username}</span> to confirm
            </label>
            <input
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              disabled={busy}
              autoFocus
              className="w-full mb-5 rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-red-600 focus:outline-none"
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                disabled={busy}
                className="rounded bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-40"
              >
                Keep my account
              </button>
              <button
                onClick={submit}
                disabled={!matches || busy}
                className="inline-flex items-center gap-2 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete my account
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Shown after sign-in when the account is pending deletion. Blocks the app until the
 * user either cancels the deletion or signs out.
 */
export function PendingDeletionGate() {
  const { user, logout } = useAuth()
  const [status, setStatus] = useState<DeletionStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cancelled, setCancelled] = useState(false)

  useEffect(() => {
    setStatus(null)
    setCancelled(false)
    if (!user) return
    let active = true
    api<DeletionStatus>('/api/account/deletion')
      .then(s => { if (active) setStatus(s) })
      .catch(() => { /* non-critical: never block the app on a failed status check */ })
    return () => { active = false }
  }, [user?.id])

  if (!user || (!status?.pending && !cancelled)) return null

  const cancel = async () => {
    setBusy(true)
    setError('')
    try {
      await api('/api/account/deletion', { method: 'DELETE' })
      setStatus({ pending: false, scheduledFor: null })
      setCancelled(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
      <div className="rounded-lg p-6 max-w-md w-full mx-4 bg-gray-900 border border-gray-700">
        {cancelled ? (
          <>
            <h2 className="text-lg font-semibold mb-3">Welcome back</h2>
            <p className="text-sm text-gray-300 mb-5">
              Your account deletion has been cancelled. Everything is as you left it, and the addon will
              resume syncing on its own.
            </p>
            <div className="flex justify-end">
              <button onClick={() => setCancelled(false)} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold mb-3">This account is scheduled for deletion</h2>
            <p className="text-sm text-gray-300 mb-5">
              Your account and all of its data will be permanently deleted on{' '}
              <span className="font-medium text-gray-100">{formatDate(status?.scheduledFor ?? null)}</span>.
              Do you want to keep it?
            </p>
            {error && (
              <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">{error}</div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={logout}
                disabled={busy}
                className="rounded bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-40"
              >
                Sign out
              </button>
              <button
                onClick={cancel}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Cancel deletion &amp; keep my account
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
