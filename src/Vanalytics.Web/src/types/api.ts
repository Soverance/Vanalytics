// Auth
export interface RegisterRequest {
  email: string
  username: string
  password: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  expiresAt: string
}

export type UserRole = 'Member' | 'Moderator' | 'Admin'

export interface UserProfile {
  id: string
  email: string
  username: string
  hasApiKey: boolean
  role: UserRole
  oAuthProvider: string | null
  createdAt: string
}

// Characters
export interface CharacterSummary {
  id: string
  name: string
  server: string
  licenseStatus: string
  isPublic: boolean
  lastSyncAt: string | null
}

export interface CharacterDetail {
  id: string
  name: string
  server: string
  licenseStatus: string
  isPublic: boolean
  lastSyncAt: string | null
  jobs: JobEntry[]
  gear: GearEntry[]
  craftingSkills: CraftingEntry[]
}

export interface JobEntry {
  job: string
  level: number
  isActive: boolean
}

export interface GearEntry {
  slot: string
  itemId: number
  itemName: string
}

export interface CraftingEntry {
  craft: string
  level: number
  rank: string
}

export interface CreateCharacterRequest {
  name: string
  server: string
}

export interface UpdateCharacterRequest {
  isPublic: boolean
}

// API Keys
export interface ApiKeyResponse {
  apiKey: string
  generatedAt: string
}

// Servers
export interface GameServer {
  id: number
  name: string
  status: string
  lastCheckedAt: string
}

export interface ServerHistory {
  name: string
  status: string
  lastCheckedAt: string
  days: number
  uptimePercent: number
  history: ServerStatusEntry[]
}

export interface ServerStatusEntry {
  status: string
  startedAt: string
  endedAt: string | null
}

// Admin
export interface AdminUser {
  id: string
  email: string
  username: string
  role: UserRole
  isSystemAccount: boolean
  hasApiKey: boolean
  oAuthProvider: string | null
  characterCount: number
  createdAt: string
  updatedAt: string
}
