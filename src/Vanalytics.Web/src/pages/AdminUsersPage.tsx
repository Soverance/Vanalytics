import { useState, useEffect } from 'react'
import { api, ApiError } from '../api/client'
import type { AdminUser, UserRole, CreateUserResponse, ResetPasswordResponse } from '../types/api'
import ConfirmModal from '../components/ConfirmModal'
import GeneratedPasswordReveal from '../components/GeneratedPasswordReveal'
import Tabs from '../components/Tabs'
import UsersList from '../components/admin/UsersList'
import UsersAnalytics from '../components/admin/UsersAnalytics'
import { useAuth } from '../context/AuthContext'
import { X, Plus } from 'lucide-react'
import { ROLES } from '../lib/adminUsers'

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<UserRole>('Member')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CreateUserResponse | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api<CreateUserResponse>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email, username, role }),
      })
      setResult(res)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (result) onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-lg border border-gray-800 bg-gray-900 p-6 mx-4">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-300"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-bold mb-4">Create User</h2>

        {error && (
          <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {result ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">
              User <span className="font-medium text-gray-100">{result.username}</span> created successfully.
            </p>
            <GeneratedPasswordReveal password={result.generatedPassword} />
            <button
              onClick={handleClose}
              className="w-full rounded bg-blue-600 py-2 font-medium hover:bg-blue-500"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={64}
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-blue-600 py-2 font-medium hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function ResetPasswordResultModal({
  result,
  onClose,
}: {
  result: ResetPasswordResponse
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg border border-gray-800 bg-gray-900 p-6 mx-4">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-300"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-bold mb-4">Password Reset</h2>
        <div className="space-y-4">
          <p className="text-sm text-gray-300">
            New password for <span className="font-medium text-gray-100">{result.username}</span>.
            Their previous password and active sessions no longer work.
          </p>
          <GeneratedPasswordReveal password={result.generatedPassword} />
          <button
            onClick={onClose}
            className="w-full rounded bg-blue-600 py-2 font-medium hover:bg-blue-500"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; username: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState('')
  const [pendingReset, setPendingReset] = useState<{ id: string; username: string } | null>(null)
  const [resetResult, setResetResult] = useState<ResetPasswordResponse | null>(null)
  const [tab, setTab] = useState<'list' | 'analytics'>('list')

  const fetchUsers = async () => {
    try {
      const data = await api<AdminUser[]>('/api/admin/users')
      setUsers(data)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  const handleRoleChange = async (id: string, role: UserRole) => {
    setError('')
    try {
      await api(`/api/admin/users/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })
      fetchUsers()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
    }
  }

  // The server deletes in the background; we keep the confirm dialog open (busy) and poll
  // until it reports deleted/failed, so it's clear the delete is still running and a
  // second click can't fire another one.
  const handleDelete = async (target: { id: string; username: string }) => {
    setError('')
    setNotice('')
    setDeleting(true)
    const finish = (message: { error?: string; notice?: string }) => {
      if (message.error) setError(message.error)
      if (message.notice) setNotice(message.notice)
      setDeleting(false)
      setPendingDelete(null)
      fetchUsers()
    }
    try {
      const { characterCount } = await api<{ characterCount: number }>(`/api/admin/users/${target.id}`, { method: 'DELETE' })
      const started = Date.now()
      for (;;) {
        await new Promise(r => setTimeout(r, 1500))
        const status = await api<{ status: string; error?: string }>(`/api/admin/users/${target.id}/deletion`)
        if (status.status === 'deleted') {
          const chars = `${characterCount} character${characterCount === 1 ? '' : 's'}`
          return finish({ notice: `Deleted "${target.username}" and ${chars}, along with all their data.` })
        }
        if (status.status === 'failed') {
          return finish({ error: `Deleting "${target.username}" failed: ${status.error ?? 'unknown error'}. Click Delete to retry.` })
        }
        if (Date.now() - started > 3 * 60_000) {
          return finish({ notice: `Still deleting "${target.username}" in the background. Refresh in a few minutes to confirm.` })
        }
      }
    } catch (err) {
      finish({ error: err instanceof ApiError ? err.message : `Deleting "${target.username}" failed: ${err instanceof Error ? err.message : 'network error'}` })
    }
  }

  const handleReset = async (id: string) => {
    setError('')
    try {
      const res = await api<ResetPasswordResponse>(`/api/admin/users/${id}/reset-password`, {
        method: 'POST',
      })
      setResetResult(res)
      fetchUsers()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('Failed to reset password')
    }
  }

  if (loading) return <p className="text-gray-400">Loading users...</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">User Management</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          Create User
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {notice && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded bg-green-900/40 border border-green-700 p-3 text-sm text-green-300">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-green-400 hover:text-green-200" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Tabs
        items={[
          { value: 'list', label: 'List', badge: users.length },
          { value: 'analytics', label: 'Analytics' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'list' ? (
        <UsersList
          users={users}
          currentUserId={currentUser?.id}
          onRoleChange={handleRoleChange}
          onRequestDelete={setPendingDelete}
          onRequestReset={setPendingReset}
        />
      ) : (
        <UsersAnalytics users={users} />
      )}

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={fetchUsers}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          message={`Delete user "${pendingDelete.username}"? This will remove all their characters and data.`}
          confirmLabel="Delete"
          busy={deleting}
          busyLabel="Deleting…"
          onConfirm={() => handleDelete(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {pendingReset && (
        <ConfirmModal
          message={`Reset password for "${pendingReset.username}"? Their current password and active sessions stop working immediately.`}
          confirmLabel="Reset password"
          onConfirm={() => { handleReset(pendingReset.id); setPendingReset(null) }}
          onCancel={() => setPendingReset(null)}
        />
      )}

      {resetResult && (
        <ResetPasswordResultModal
          result={resetResult}
          onClose={() => setResetResult(null)}
        />
      )}
    </div>
  )
}
