// Auth
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
  displayName: string | null
  hasApiKey: boolean
  apiKeyCreatedAt: string | null
  role: UserRole
  avatarUrl: string | null
  oAuthProvider: string | null
  defaultServer: string | null
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
  faceModelId?: number
  subJob?: string
  subJobLevel?: number
  masterLevel?: number
  itemLevel?: number
  hp?: number
  maxHp?: number
  mp?: number
  maxMp?: number
  linkshell?: string
  nation?: number
  nationRank?: number
  rankPoints?: number
  titleId?: number
  title?: string
  // Base stats (from packet 0x061)
  baseStr?: number
  baseDex?: number
  baseVit?: number
  baseAgi?: number
  baseInt?: number
  baseMnd?: number
  baseChr?: number
  // Added stats from gear/buffs (from packet 0x061)
  addedStr?: number
  addedDex?: number
  addedVit?: number
  addedAgi?: number
  addedInt?: number
  addedMnd?: number
  addedChr?: number
  // Combat stats (from packet 0x061)
  attack?: number
  defense?: number
  // Elemental resistances (from packet 0x061)
  resFire?: number
  resIce?: number
  resWind?: number
  resEarth?: number
  resLightning?: number
  resWater?: number
  resLight?: number
  resDark?: number
  playtimeSeconds?: number
  merits?: Record<string, number>
  jobs: JobEntry[]
  gear: GearEntry[]
  craftingSkills: CraftingEntry[]
  skills: SkillEntry[]
  favoriteAnimation?: { category: string; animationName: string; motionIndex: number }
}

export interface JobEntry {
  job: string
  level: number
  isActive: boolean
  jp: number
  jpSpent: number
  cp: number
}

export interface GearEntry {
  slot: string
  itemId: number
  itemName: string
  augments: string[]
}

export interface SkillEntry {
  skill: string
  level: number
  cap: number
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

// Forum
export interface CategoryResponse {
  id: number
  name: string
  slug: string
  description: string
  displayOrder: number
  isSystem: boolean
  requiresAdminForNewThreads: boolean
  threadCount: number
  lastActivityAt: string | null
}

export interface EnrichedThreadSummaryResponse {
  id: number
  title: string
  slug: string
  isPinned: boolean
  isLocked: boolean
  isDeleted: boolean
  authorId: string
  replyCount: number
  voteCount: number
  createdAt: string
  lastPostAt: string
  authorUsername: string
  authorDisplayName: string | null
  authorAvatarHash: string | null
}

export interface ThreadDetailResponse {
  id: number
  title: string
  slug: string
  categoryId: number
  categoryName: string
  categorySlug: string
  isPinned: boolean
  isLocked: boolean
  isDeleted: boolean
  categoryIsSystem: boolean
  authorId: string
  createdAt: string
  lastPostAt: string
  authorUsername: string
  authorDisplayName: string | null
  authorAvatarHash: string | null
}

export interface ReactionSummary {
  like: number
  thanks: number
  funny: number
}

export interface QuotedPostInfo {
  id: number
  authorUsername: string
  authorDisplayName: string | null
  body: string
  isDeleted: boolean
}

export interface EnrichedPostResponse {
  id: number
  authorId: string
  body: string | null
  isEdited: boolean
  isDeleted: boolean
  reactions: ReactionSummary
  userReactions: string[]
  replyToPostId: number | null
  quotedPost: QuotedPostInfo | null
  createdAt: string
  updatedAt: string | null
  authorUsername: string
  authorDisplayName: string | null
  authorAvatarHash: string | null
  authorPostCount: number
  authorJoinedAt: string
}

export interface PaginatedThreads {
  threads: EnrichedThreadSummaryResponse[]
  hasMore: boolean
}

export interface PaginatedPosts {
  posts: EnrichedPostResponse[]
  hasMore: boolean
}

export interface ForumSearchResult {
  threadId: number
  threadTitle: string
  threadSlug: string
  categorySlug: string
  categoryName: string
  isPinned: boolean
  isLocked: boolean
  authorId: string
  authorUsername: string
  authorAvatarHash: string | null
  matchSnippet: string
  replyCount: number
  voteCount: number
  lastPostAt: string
}

export interface PaginatedSearchResults {
  results: ForumSearchResult[]
  hasMore: boolean
}

export interface PurgeResponse {
  threadDeleted: boolean
}

// User profiles
export interface UserRecentPost {
  postId: number
  threadTitle: string
  categorySlug: string
  threadSlug: string
  createdAt: string
  bodyPreview: string
}

export interface UserPublicCharacter {
  name: string
  server: string
  activeJob: string | null
  activeJobLevel: number
}

export interface UserProfileResponse {
  username: string
  displayName: string | null
  avatarUrl: string | null
  joinedAt: string
  postCount: number
  recentPosts: UserRecentPost[]
  publicCharacters: UserPublicCharacter[]
}

// Admin
export interface AdminUser {
  id: string
  email: string
  username: string
  displayName: string | null
  role: UserRole
  isSystemAccount: boolean
  hasApiKey: boolean
  oAuthProvider: string | null
  characterCount: number
  createdAt: string
  updatedAt: string
}

export interface CreateUserRequest {
  email: string
  username: string
  role: UserRole
}

export interface CreateUserResponse {
  id: string
  email: string
  username: string
  role: string
  generatedPassword: string
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
  baseSell: number | null
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
  baseSell: number | null
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

// Session types
export interface SessionSummary {
  id: string
  characterId: string
  characterName: string
  server: string
  zone: string
  startedAt: string
  endedAt: string | null
  status: 'Active' | 'Completed' | 'Abandoned'
  totalDamage: number
  gilEarned: number
  mobsKilled: number
  itemsDropped: number
}

export interface SessionDetail extends SessionSummary {
  dpsAverage: number
  gilPerHour: number
  expGained: number
  healingDone: number
  eventCount: number
  limitPointsGained: number
  accuracy: number
  critRate: number
  parryRate: number
}

export interface SessionEvent {
  id: number
  eventType: string
  timestamp: string
  source: string
  target: string
  value: number
  ability: string | null
  itemId: number | null
  zone: string
}

export interface SessionTimelineEntry {
  timestamp: string
  damage: number
  healing: number
  gil: number
  kills: number
}

export interface SessionListResponse {
  totalCount: number
  page: number
  pageSize: number
  sessions: SessionSummary[]
}

export interface SessionEventsResponse {
  totalCount: number
  page: number
  pageSize: number
  events: SessionEvent[]
}

export interface SessionTrendEntry {
  sessionId: string
  date: string
  durationMinutes: number
  gilPerHour: number
  killsPerHour: number
  dropsPerHour: number
  totalDamage: number
  mobsKilled: number
  itemsDropped: number
  limitPoints: number
}

// Inventory types
export interface InventoryItem {
  itemId: number
  bag: string
  slotIndex: number
  quantity: number
  lastSeenAt: string
  itemName: string
  iconPath: string | null
  category: string | null
  stackSize: number
  baseSell: number | null
  isRare: boolean
  isExclusive: boolean
  augments: string[]
}

export type InventoryByBag = Record<string, InventoryItem[]>

export interface PorterItem {
  itemId: number
  itemName: string
  iconPath: string | null
  category: string | null
  baseSell: number | null
  stackSize: number
  isRare: boolean
  isExclusive: boolean
}

export interface PorterSlip {
  slipItemId: number
  slipNumber: number
  slipName: string
  slipIconPath: string | null
  syncedAt: string
  userHidden: boolean
  items: PorterItem[]
}

export interface SlotInfo {
  bag: string
  slotIndex: number
  quantity: number
}

export interface MoveInstruction {
  itemId: number
  fromBag: string
  fromSlot: number
  toBag: string
  quantity: number
}

export interface SuggestedFix {
  moves: MoveInstruction[]
}

export interface AnomalyDetails {
  slots?: SlotInfo[]
  bagName?: string
  usedSlots?: number
  maxSlots?: number
}

export interface Anomaly {
  type: 'duplicate' | 'nearCapacity'
  severity: 'info' | 'warning'
  anomalyKey: string
  itemId: number | null
  itemName: string | null
  bags: string[]
  isEquipment: boolean
  details: AnomalyDetails
  suggestedFix: SuggestedFix | null
}

export interface MoveOrderResponse {
  id: number
  itemId: number
  itemName: string
  fromBag: string
  fromSlot: number
  toBag: string
  quantity: number
  status: string
  createdAt: string
}

export interface AnomalyResponse {
  anomalies: Anomaly[]
  dismissedCount: number
  dismissedKeys: { key: string; label: string }[]
  pendingMoves: MoveOrderResponse[]
}

// Relics types
export interface RelicWeaponVersion {
  itemId: number
  name: string
  iconPath: string | null
  itemLevel: number | null
  level: number | null
  damage: number | null
  delay: number | null
  stage: string
  currentlyHeld: boolean
}

export interface RelicWeapon {
  baseName: string
  category: string
  weaponSkill: string | null
  versions: RelicWeaponVersion[]
}

export interface RelicCategoryProgress {
  category: string
  total: number
  collected: number
}

export interface RelicsResponse {
  progress: RelicCategoryProgress[]
  weapons: RelicWeapon[]
}

// Progression — sourced from packet 0x063 Orders 0x02 / 0x05 / 0x06.
export interface JobPointEntry {
  jobId: number
  capacityPoints: number
  points: number
  pointsSpent: number
}

export interface WarpUnlocks {
  homePoints: number[]
  survivalGuides: number[]
  waypoints: number[]
  telepoints: number[]
  cavernousMaws: number[]
  lycopodium: number[]
  eschanPortals: number[]
}

export interface ProgressionResponse {
  limitPoints: number | null
  meritPoints: number | null
  meritPointsMax: number | null
  jobPointsUnlocked: boolean | null
  jobPoints: JobPointEntry[] | null
  warps: WarpUnlocks | null
  updatedAt: string | null
}

// Missions — sourced from packet 0x056. Each line is either bitfield-style
// (completed = array of mission indices) or pointer-style (current = single int).
export interface MissionLineState {
  completed?: number[] | null
  current?: number | null
}

// Collection — spells (incl. trusts) + key items, sourced from Windower
// runtime APIs (windower.ffxi.get_spells / get_key_items).
export interface CollectionResponse {
  spellIds: number[] | null
  keyItemIds: number[] | null
  updatedAt: string | null
}

// Titles — accumulator over per-sync TitleId snapshots. Each row is one
// distinct title ever observed equipped on this character during a sync.
export interface TitleEntry {
  titleId: number
  firstSeenAt: string
  lastEquippedAt: string
}

export interface TitlesResponse {
  currentTitleId: number | null
  titles: TitleEntry[]
}

export interface MissionsResponse {
  sandoriaMissions: MissionLineState | null
  bastokMissions: MissionLineState | null
  windurstMissions: MissionLineState | null
  zilartMissions: MissionLineState | null
  ahturhganMissions: MissionLineState | null
  wotgMissions: MissionLineState | null
  assaults: MissionLineState | null
  copMissions: MissionLineState | null
  acpMissions: MissionLineState | null
  mkdMissions: MissionLineState | null
  asaMissions: MissionLineState | null
  soaMissions: MissionLineState | null
  rovMissions: MissionLineState | null
  tvrMissions: MissionLineState | null
  updatedAt: string | null
}

export interface ZoneSpawnDto {
  poolId: number | null
  name: string
  x: number
  y: number
  z: number
  rotation: number
  minLevel: number
  maxLevel: number
  isMonster: boolean | null
}

export interface ItemOwnerEntry {
  name: string
  server: string
  job: string | null
  level: number | null
}

export interface ItemOwnersResponse {
  equipped: ItemOwnerEntry[]
  inventory: ItemOwnerEntry[]
}

export interface PlayerListItem {
  name: string
  server: string
  job: string | null
  level: number | null
  race: string | null
  linkshell: string | null
  lastSyncedAt: string | null
}

// Crafting Recipes
export interface RecipeSummary {
  id: number
  resultItemId: number
  resultItemName: string
  resultItemIcon: string | null
  resultQty: number
  primaryCraft: string
  primaryCraftLevel: number
  subCrafts: { craft: string; level: number }[]
  crystalItemId: number
  crystalName: string
  crystalIcon: string | null
  ingredientCount: number
  isDesynth: boolean
  ingredients?: { itemId: number; name: string; quantity: number; baseSell: number | null }[]
}

export interface RecipeSearchResult {
  totalCount: number
  page: number
  pageSize: number
  recipes: RecipeSummary[]
}

export interface RecipeIngredientDetail {
  itemId: number
  name: string
  iconPath: string | null
  quantity: number
  stackSize: number
}

export interface RecipeItemRef {
  itemId: number
  name: string
  iconPath: string | null
  quantity: number
}

export interface RecipeDetail {
  id: number
  primaryCraft: string
  primaryCraftLevel: number
  subCrafts: { craft: string; level: number }[]
  crystal: RecipeItemRef
  hqCrystal: RecipeItemRef | null
  ingredients: RecipeIngredientDetail[]
  result: RecipeItemRef
  resultHq1: RecipeItemRef | null
  resultHq2: RecipeItemRef | null
  resultHq3: RecipeItemRef | null
  isDesynth: boolean
  contentTag: string | null
  skillRequirements: Record<string, number>
}

export interface ItemRecipeInfo {
  craftedFrom: {
    id: number
    resultItemName: string
    primaryCraft: string
    primaryCraftLevel: number
    resultQty: number
    isHqResult: boolean
  }[]
  usedIn: {
    id: number
    resultItemName: string
    primaryCraft: string
    primaryCraftLevel: number
    quantity: number
  }[]
}

// Gear Sets
export interface GearSetSummary {
  id: number
  name: string
  job: string | null
  slotCount: number
  updatedAt: string
}

export interface GearSetSlot {
  slot: string
  itemId: number
  itemName: string
  augments: string[]
}

export interface GearSetDetail {
  id: number
  name: string
  job: string | null
  slots: GearSetSlot[]
  createdAt: string
  updatedAt: string
}

export interface OwnedEquipmentItem {
  itemId: number
  itemName: string
  iconPath: string | null
  slots: number | null
  jobs: number | null
  augments: string[]
}
