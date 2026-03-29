import { useState, useEffect } from 'react'
import { api, ApiError } from '../api/client'
import type { AdminUser, UserRole, CreateUserResponse } from '../types/api'
import UserAvatar from '../components/UserAvatar'
import { useAuth } from '../context/AuthContext'
import { X, Plus, Copy, Check } from 'lucide-react'

const ROLES: UserRole[] = ['Member', 'Moderator', 'Admin']

const roleBadgeStyles: Record<UserRole, string> = {
  Admin: 'bg-amber-900/50 text-amber-400',
  Moderator: 'bg-blue-900/50 text-blue-400',
  Member: 'bg-gray-800 text-gray-500',
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<UserRole>('Member')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CreateUserResponse | null>(null)
  const [copied, setCopied] = useState(false)

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

  const handleCopy = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result.generatedPassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Generated Password
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={result.generatedPassword}
                  className="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 font-mono text-sm"
                />
                <button
                  onClick={handleCopy}
                  className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                  title="Copy password"
                >
                  {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-2 text-xs text-amber-400">
                Save this password — it won't be shown again.
              </p>
            </div>
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

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

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

  const handleDelete = async (id: string, username: string) => {
    if (!confirm(`Delete user "${username}"? This will remove all their characters and data.`)) return
    try {
      await api(`/api/admin/users/${id}`, { method: 'DELETE' })
      fetchUsers()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
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

      <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Auth</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Characters</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Joined</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-800 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <UserAvatar username={u.username} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-200 truncate">{u.username}</p>
                      <p className="text-xs text-gray-500 truncate">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-gray-400">
                  {u.oAuthProvider
                    ? u.oAuthProvider.charAt(0).toUpperCase() + u.oAuthProvider.slice(1)
                    : 'Local'}
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-gray-400">
                  {u.characterCount}
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-gray-500">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  {u.isSystemAccount || u.id === currentUser?.id ? (
                    <span className={`rounded px-2 py-1 text-xs font-medium ${roleBadgeStyles[u.role]}`}>
                      {u.role}
                    </span>
                  ) : (
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                      className={`rounded px-2 py-1 text-xs font-medium border-0 cursor-pointer ${roleBadgeStyles[u.role]}`}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {!u.isSystemAccount && u.role !== 'Admin' && (
                    <button
                      onClick={() => handleDelete(u.id, u.username)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-600">
        {users.length} user{users.length !== 1 ? 's' : ''} registered
      </p>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={fetchUsers}
        />
      )}
    </div>
  )
}
