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
  isPublic: boolean
  lastSyncAt: string | null
}

export interface CharacterDetail {
  id: string
  name: string
  server: string
  isPublic: boolean
  lastSyncAt: string | null
  race?: string
  gender?: string
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
  uptimeTrend: TrendPoint[]
  history: ServerStatusEntry[]
}

export interface ServerStatusEntry {
  status: string
  startedAt: string
  endedAt: string | null
}

// Server Analytics Dashboard
export interface ServerAnalytics {
  serviceHealth: ServiceHealth
  uptimeTrend: TrendPoint[]
  serverRankings: ServerRanking[]
  heatmap: ServerHeatmapData[]
  recentIncidents: ServerIncident[]
}

export interface ServiceHealth {
  status: string
  onlinePercent: number
  uptimePercent: number
  totalServers: number
  onlineServers: number
  lastCheckedAt: string | null
}

export interface TrendPoint {
  timestamp: string
  percent: number
}

export interface ServerRanking {
  name: string
  uptimePercent: number
  status: string
}

export interface ServerHeatmapData {
  name: string
  days: HeatmapCell[]
}

export interface HeatmapCell {
  date: string
  uptimePercent: number
  dominantStatus: string
}

export interface ServerIncident {
  id: number
  serverName: string
  status: string
  startedAt: string
  endedAt: string | null
  duration: string | null
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
  itemLevel: number | null
  skill: number | null
  stackSize: number
  iconPath: string | null
  isRare: boolean
  isExclusive: boolean
  isNoAuction: boolean
  // Stats (included for table view / sorting)
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
  itemLevel: number | null
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
  isNoAuction: boolean
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

// Vana'diel Clock
export interface VanadielClockData {
  time: VanadielTime
  dayOfWeek: string
  element: string
  moon: MoonPhaseInfo
  conquest: ConquestInfo
  guilds: GuildStatus[]
  ferry: FerryScheduleInfo
  rse: RseInfo
}

export interface VanadielTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export interface MoonPhaseInfo {
  phaseName: string
  percent: number
}

export interface ConquestInfo {
  earthSecondsRemaining: number
  vanadielDaysRemaining: number
}

export interface GuildStatus {
  name: string
  isOpen: boolean
  holiday: string
  openHour: number
  closeHour: number
}

export interface FerryScheduleInfo {
  selbinaToMhaura: FerryDirection
  mhauraToSelbina: FerryDirection
}

export interface FerryDirection {
  nextDeparture: string
  nextArrival: string
}

export interface RseInfo {
  currentRace: string
  currentLocation: string
  nextRace: string
  nextChangeEarthSeconds: string
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

// Stat filtering
export interface StatFilter {
  stat: string
  min: string
  max: string
}

// Model mappings
export interface ModelMapping {
  itemId: number
  slotId: number
  modelId: number
}
