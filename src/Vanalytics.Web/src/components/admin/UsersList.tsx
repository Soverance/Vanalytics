import { useMemo, useState } from 'react'
import type { AdminUser, UserRole } from '../../types/api'
import {
  ROLES, authTypeOf, filterUsers, sortUsers,
  type AuthType, type SortDir, type UserSortKey,
} from '../../lib/adminUsers'
import { timeAgo } from '../../lib/leaderboards'
import UserAvatar from '../UserAvatar'
import { ArrowUp, ArrowDown } from 'lucide-react'

const roleBadgeStyles: Record<UserRole, string> = {
  Admin: 'bg-amber-900/50 text-amber-400',
  Moderator: 'bg-blue-900/50 text-blue-400',
  Member: 'bg-gray-800 text-gray-500',
}

const AUTH_OPTIONS: { value: AuthType | 'all'; label: string }[] = [
  { value: 'all', label: 'All auth' },
  { value: 'local', label: 'Local' },
  { value: 'google', label: 'Google' },
  { value: 'microsoft', label: 'Microsoft' },
  { value: 'discord', label: 'Discord' },
]

interface UsersListProps {
  users: AdminUser[]
  currentUserId: string | undefined
  onRoleChange: (id: string, role: UserRole) => void
  onRequestDelete: (u: { id: string; username: string }) => void
  onRequestReset: (u: { id: string; username: string }) => void
}

const selectClass = 'rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-200 focus:border-blue-500 focus:outline-none'

export default function UsersList({
  users, currentUserId, onRoleChange, onRequestDelete, onRequestReset,
}: UsersListProps) {
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<UserRole | 'all'>('all')
  const [auth, setAuth] = useState<AuthType | 'all'>('all')
  const [sortKey, setSortKey] = useState<UserSortKey>('createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const visible = useMemo(() => {
    const filtered = filterUsers(users, { search, role, auth })
    return sortUsers(filtered, sortKey, sortDir)
  }, [users, search, role, auth, sortKey, sortDir])

  const toggleSort = (key: UserSortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'username' || key === 'role' ? 'asc' : 'desc') }
  }

  const SortHeader = ({ label, k, className }: { label: string; k: UserSortKey; className?: string }) => (
    <th className={`px-4 py-3 font-medium ${className ?? ''}`}>
      <button type="button" onClick={() => toggleSort(k)} className="flex items-center gap-1 hover:text-gray-300">
        {label}
        {sortKey === k && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  )

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search username, name, or email…"
          className="flex-1 min-w-[200px] rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        <select value={role} onChange={(e) => setRole(e.target.value as UserRole | 'all')} className={selectClass}>
          <option value="all">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={auth} onChange={(e) => setAuth(e.target.value as AuthType | 'all')} className={selectClass}>
          {AUTH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-500">
              <SortHeader label="User" k="username" />
              <th className="px-4 py-3 font-medium hidden sm:table-cell">Auth</th>
              <SortHeader label="Characters" k="characterCount" className="hidden md:table-cell" />
              <SortHeader label="Joined" k="createdAt" className="hidden md:table-cell" />
              <SortHeader label="Last active" k="lastActiveAt" className="hidden lg:table-cell" />
              <SortHeader label="Role" k="role" />
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((u) => (
              <tr key={u.id} className="border-b border-gray-800 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <UserAvatar username={u.username} displayName={u.displayName} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-200 truncate">{u.displayName ?? u.username}</p>
                      <p className="text-xs text-gray-500 truncate">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-gray-400">
                  {u.oAuthProvider
                    ? authTypeOf(u).charAt(0).toUpperCase() + authTypeOf(u).slice(1)
                    : 'Local'}
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-gray-400">{u.characterCount}</td>
                <td className="px-4 py-3 hidden md:table-cell text-gray-500">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-gray-500">
                  {u.lastActiveAt ? timeAgo(u.lastActiveAt) : 'Never'}
                </td>
                <td className="px-4 py-3">
                  {u.isSystemAccount || u.id === currentUserId ? (
                    <span className={`rounded px-2 py-1 text-xs font-medium ${roleBadgeStyles[u.role]}`}>{u.role}</span>
                  ) : (
                    <select
                      value={u.role}
                      onChange={(e) => onRoleChange(u.id, e.target.value as UserRole)}
                      className={`rounded px-2 py-1 text-xs font-medium border-0 cursor-pointer ${roleBadgeStyles[u.role]}`}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    {u.hasPassword && !u.isSystemAccount && (
                      <button onClick={() => onRequestReset({ id: u.id, username: u.username })} className="text-xs text-gray-400 hover:text-gray-200">
                        Reset password
                      </button>
                    )}
                    {!u.isSystemAccount && u.role !== 'Admin' && (
                      <button onClick={() => onRequestDelete({ id: u.id, username: u.username })} className="text-xs text-red-400 hover:text-red-300">
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-600">
        Showing {visible.length} of {users.length} user{users.length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}
