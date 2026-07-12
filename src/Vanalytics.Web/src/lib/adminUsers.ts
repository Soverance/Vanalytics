import type { AdminUser, UserRole } from '../types/api'

export const ROLES: UserRole[] = ['Member', 'Moderator', 'Admin']

export type AuthType = 'local' | 'google' | 'microsoft' | 'discord'
export type UserSortKey = 'username' | 'characterCount' | 'createdAt' | 'lastActiveAt' | 'role'
export type SortDir = 'asc' | 'desc'

export interface UserFilters {
  search: string
  role: UserRole | 'all'
  auth: AuthType | 'all'
}

export function authTypeOf(u: AdminUser): AuthType {
  return (u.oAuthProvider?.toLowerCase() as AuthType) ?? 'local'
}

export function filterUsers(users: AdminUser[], f: UserFilters): AdminUser[] {
  const q = f.search.trim().toLowerCase()
  return users.filter((u) => {
    if (f.role !== 'all' && u.role !== f.role) return false
    if (f.auth !== 'all' && authTypeOf(u) !== f.auth) return false
    if (q) {
      const hay = `${u.username} ${u.displayName ?? ''} ${u.email}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

const ROLE_ORDER: Record<UserRole, number> = { Member: 0, Moderator: 1, Admin: 2 }

function ts(iso: string | null): number {
  return iso ? new Date(iso).getTime() : 0
}

function compareBy(a: AdminUser, b: AdminUser, key: UserSortKey): number {
  switch (key) {
    case 'username': return a.username.localeCompare(b.username)
    case 'characterCount': return a.characterCount - b.characterCount
    case 'role': return ROLE_ORDER[a.role] - ROLE_ORDER[b.role]
    case 'createdAt': return ts(a.createdAt) - ts(b.createdAt)
    case 'lastActiveAt': return ts(a.lastActiveAt) - ts(b.lastActiveAt)
  }
}

export function sortUsers(users: AdminUser[], key: UserSortKey, dir: SortDir): AdminUser[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...users].sort((a, b) => sign * compareBy(a, b, key))
}
