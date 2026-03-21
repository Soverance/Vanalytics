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

// Items / Economy
export interface GameItemSummary {
  itemId: number
  name: string
  category: string
  level: number | null
  skill: number | null
  stackSize: number
  iconPath: string | null
  isRare: boolean
  isExclusive: boolean
  isAuctionable: boolean
}

export interface GameItemDetail {
  itemId: number
  name: string
  nameJa: string | null
  nameLong: string | null
  description: string | null
  descriptionJa: string | null
  category: string
  type: number
  flags: number
  stackSize: number
  level: number | null
  jobs: number | null
  races: number | null
  slots: number | null
  skill: number | null
  damage: number | null
  delay: number | null
  def: number | null
  hp: number | null
  mp: number | null
  str: number | null
  dex: number | null
  vit: number | null
  agi: number | null
  int: number | null
  mnd: number | null
  chr: number | null
  accuracy: number | null
  attack: number | null
  rangedAccuracy: number | null
  rangedAttack: number | null
  magicAccuracy: number | null
  magicDamage: number | null
  magicEvasion: number | null
  evasion: number | null
  enmity: number | null
  haste: number | null
  storeTP: number | null
  tpBonus: number | null
  physicalDamageTaken: number | null
  magicDamageTaken: number | null
  iconPath: string | null
  previewImagePath: string | null
  isRare: boolean
  isExclusive: boolean
  isAuctionable: boolean
}

export interface ItemSearchResult {
  totalCount: number
  page: number
  pageSize: number
  items: GameItemSummary[]
}

export interface PriceStats {
  median: number
  min: number
  max: number
  average: number
  salesPerDay: number
}

export interface AhSale {
  price: number
  soldAt: string
  sellerName: string
  buyerName: string
  stackSize: number
}

export interface PriceHistoryResponse {
  totalCount: number
  page: number
  pageSize: number
  days: number
  stats: PriceStats | null
  sales: AhSale[]
}

export interface CrossServerPrice {
  server: string
  median: number
  min: number
  max: number
  average: number
  saleCount: number
}

export interface CrossServerResponse {
  days: number
  servers: CrossServerPrice[]
}

// Bazaar
export interface BazaarZoneGroup {
  zone: string
  playerCount: number
  players: BazaarPlayer[]
}

export interface BazaarPlayer {
  playerName: string
  lastSeenAt: string
}

export interface BazaarListingItem {
  sellerName: string
  price: number
  quantity: number
  zone: string
  lastSeenAt: string
  serverName: string
}
