# Economy Tracking Design Spec

**Date:** 2026-03-21
**Status:** Draft
**Authors:** Scott McCutchen, Claude

## Overview

Vanalytics Economy Tracking replicates FFXIAH-style functionality: a complete FFXI item database with auction house price history, cross-server price comparison, and bazaar tracking. Data is crowd-sourced from players running the Vanalytics Windower addon.

This is a large feature decomposed into three sub-specs for implementation:

1. **Sub-spec A:** Item Database + AH Transaction Ingestion (this document)
2. **Sub-spec B:** Economy Frontend (item search, price charts, bazaar activity pages)
3. **Sub-spec C:** Bazaar Tracking (presence scanning, contents capture, bazaar ingestion)

Each sub-spec gets its own implementation plan. This document covers all three designs; implementation follows in order A → B → C.

---

## Sub-spec A: Item Database + AH Transaction Ingestion

### Item Database

#### Data Source

Items are seeded from the [Windower Resources](https://github.com/Windower/Resources) repository, which extracts structured data directly from the FFXI game client's DAT files. This is maintained by the Windower community and updated after game patches.

**Source files used:**
- `resources_data/items.lua` — Item ID, name (EN/JA), category, flags, stack size, level, jobs bitmask, races bitmask, slots bitmask, weapon skill type, damage, delay
- `resources_data/item_descriptions.lua` — Full stat text (DEF, ATK, magic stats, special abilities, aftermath effects)
- `resources_data/skills.lua` — Weapon skill type lookup (Dagger, Sword, etc.)
- `resources_data/slots.lua` — Equipment slot lookup

**Image sources:**
- **Icons (32x32):** Downloaded from `https://static.ffxiah.com/images/icon/{itemId}.png`
- **Preview images (larger):** Downloaded from BG Wiki, resolved via item pages (e.g., `https://www.bg-wiki.com/images/.../ItemName_description.png`)

#### Data Model: GameItem

| Column | Type | Notes |
|--------|------|-------|
| ItemId | int | PK, game-internal item ID |
| Name | string | English name |
| NameJa | string | Japanese name |
| NameLong | string | Unabbreviated English name |
| Description | string | Raw stat/description text (EN) |
| DescriptionJa | string | Raw stat/description text (JA) |
| Category | string | Weapon, Armor, General, Crystal, etc. |
| Type | int | Item type code |
| Flags | int | Bitmask: Rare, Ex, etc. |
| StackSize | int | 1 for unstackable, 12 or 99 for stackable |
| Level | int? | Required level (equipment only) |
| Jobs | int? | Bitmask of equippable jobs |
| Races | int? | Bitmask of equippable races |
| Slots | int? | Bitmask of equipment slots |
| Skill | int? | Weapon skill type ID (FK to skills) |
| Damage | int? | Weapon DMG |
| Delay | int? | Weapon delay |
| DEF | int? | Defense |
| HP | int? | Hit points |
| MP | int? | Magic points |
| STR | int? | Strength |
| DEX | int? | Dexterity |
| VIT | int? | Vitality |
| AGI | int? | Agility |
| INT | int? | Intelligence |
| MND | int? | Mind |
| CHR | int? | Charisma |
| Accuracy | int? | |
| Attack | int? | |
| RangedAccuracy | int? | |
| RangedAttack | int? | |
| MagicAccuracy | int? | |
| MagicDamage | int? | |
| MagicEvasion | int? | |
| Evasion | int? | |
| Enmity | int? | |
| Haste | int? | Haste (percent) |
| StoreTP | int? | |
| TPBonus | int? | |
| PhysicalDamageTaken | int? | Percent (negative = reduction) |
| MagicDamageTaken | int? | Percent (negative = reduction) |
| IconPath | string? | Relative path to 32x32 icon image (stored in persistent volume/blob storage) |
| PreviewImagePath | string? | Relative path to larger preview image (stored in persistent volume/blob storage) |
| CreatedAt | DateTimeOffset | |
| UpdatedAt | DateTimeOffset | |

**Indexes:**
- PK on `ItemId`
- Index on `Category`
- Index on `Name` (for search — consider full-text index in production)
- Index on `Level`

> **Note on stat columns:** The ~25 dedicated stat columns cover the most common numeric stats that appear on thousands of items. Exotic stats (Subtle Blow, Double Attack, Magic Burst Bonus, etc.) and special effects (Aftermath, Latent, Additional Effect) live in the raw `Description` text. New stat columns can be added via migration if analytics demand warrants it.

#### Seeding Process

1. **First run** (GameItem table empty):
   - Fetch `items.lua` and `item_descriptions.lua` from Windower Resources GitHub (raw content)
   - Parse Lua table format into item records
   - Extract numeric stat values from description text via regex into dedicated columns
   - Bulk insert all items
   - Download icon images from FFXIAH CDN (only for items that don't already have an icon on disk). Rate limit: max 5 concurrent downloads, 100ms delay between requests.
   - Download preview images from BG Wiki (resolve URLs via FFXIAH item page links). Same rate limiting. If a download fails, store a null path and use a placeholder icon in the UI.

2. **Subsequent runs** (table already populated):
   - Skip — the seeder only runs when the table is empty

3. **Background sync job** (`ItemDatabaseSyncJob`, runs daily):
   - Check the Windower Resources repo for new commits since last sync (via GitHub API or raw file hash comparison)
   - If changed, re-fetch and parse the Lua files
   - Upsert items: update existing records, insert new ones
   - Download icons/preview images only for new or changed items

#### Item Flags Decoding

The `Flags` field is a bitmask. Common flags:
- Bit 5 (32): Rare
- Bit 13 (8192): Exclusive (Ex)
- Bit 15 (32768): Can be sold on AH

The API should expose decoded flag booleans (`isRare`, `isExclusive`, `isAuctionable`) in responses.

#### Jobs Bitmask Decoding

Each bit corresponds to a job ID (WAR=bit 0, MNK=bit 1, WHM=bit 2, etc.). The API should expose decoded job abbreviations in responses.

---

### AH Transaction Ingestion

#### Data Model: AuctionSale

| Column | Type | Notes |
|--------|------|-------|
| Id | long | PK, auto-increment |
| ItemId | int | FK → GameItem |
| ServerId | int | FK → GameServer |
| Price | int | Sale price in gil |
| SoldAt | DateTimeOffset | When the sale occurred |
| SellerName | string | Seller character name |
| BuyerName | string | Buyer character name |
| StackSize | int | 1 for single, 12/99 for stack sale |
| ReportedByUserId | GUID | FK → User (who submitted this data) |
| ReportedAt | DateTimeOffset | When the data was submitted |

**Unique constraint for deduplication:** `(ItemId, ServerId, Price, SoldAt, BuyerName, SellerName, StackSize)`

When multiple addon users browse the same item, they'll submit overlapping sales data. The dedup constraint ensures each real transaction is stored once. On conflict, skip the duplicate. In the edge case where two truly identical transactions occur (same item, price, both parties, timestamp, stack size), one will be collapsed — this is acceptable given the AH history packet format.

**Indexes:**
- Unique on `(ItemId, ServerId, Price, SoldAt, BuyerName, SellerName, StackSize)`
- Index on `(ItemId, ServerId, SoldAt)` for price history queries
- Index on `(ServerId, SoldAt)` for server-wide recent activity

**Data retention:** Detailed transaction records are kept indefinitely for the first year. After exceeding 10M rows, consider aggregating records older than 1 year into daily summary tables (min/max/median/volume per item per server per day).

#### Addon: AH Packet Capture

The Windower addon registers for incoming packet `0x0E7` (AH History). When the player browses an item's history on the auction house, the game sends a packet containing recent sales (typically 10-20 per page). The addon:

1. Parses the packet for: item ID, sale entries (price, date, buyer name, seller name, stack flag)
2. Collects the entries into a batch
3. POSTs to `/api/economy/ah` with `X-Api-Key` header

#### API Endpoint: AH Ingestion

`POST /api/economy/ah` — API Key auth

```json
{
  "itemId": 4096,
  "server": "Asura",
  "sales": [
    {
      "price": 2000,
      "soldAt": "2026-03-20T12:00:00Z",
      "sellerName": "PlayerA",
      "buyerName": "PlayerB",
      "stackSize": 1
    }
  ]
}
```

Response: `200 OK` with `{ "accepted": 15, "duplicates": 5 }` — tells the addon how many were new vs already known.

Rate limiting: 120 requests per hour per API key (separate pool from character sync's 20 req/hr). This higher limit accounts for active AH browsing sessions where a player may view many items in succession. Each item browse triggers one batch submission.

#### Server Name Resolution

Ingestion payloads submit server by name string (e.g., `"server": "Asura"`). The API resolves this against the `GameServer` table. If the server name is not found, the API returns `400 Bad Request` with a descriptive message. This prevents typos from creating phantom server records.

> **Future consideration:** The existing `Character.Server` field is a plain string. Once economy tracking is stable, consider migrating `Character.Server` to an FK to `GameServer.Id` for consistency across the data model.

---

## Sub-spec B: Economy Frontend

### Public Pages (no auth required)

These pages are publicly accessible, like FFXIAH. No login required.

> **Note:** Sub-spec B is implemented before Sub-spec C (bazaar tracking). Bazaar-related UI sections (bazaar listings on item detail, bazaar activity page) should render "Coming soon" placeholders until Sub-spec C provides the data layer.

#### Item Database Page (`/items`)

- Search bar with text search (by name)
- Category filter tabs (Weapon, Armor, General, Crystal, etc.)
- Weapon type filter (Dagger, Sword, etc.) when Weapon category selected
- Level range filter
- Job filter (equippable by)
- Results grid: icon, name, category, level, jobs, key stats
- Pagination (25 items per page)
- Clicking an item navigates to the detail page

#### Item Detail Page (`/items/{id}`)

**Header section:**
- Item icon (32x32) + preview image (larger)
- Item name, Japanese name
- Full stats table (all dedicated stat columns, decoded flags, decoded jobs)
- Raw description text for special effects

**Price section (per server):**
- Server selector dropdown (populated from GameServer table)
- Summary stats: median price, min, max, average, sales rate (sold/day), current stock
- Price history area chart (time on X axis, price on Y)
- Cross-server median price comparison bar chart

**Recent sales table (paginated):**
- Date, price, buyer, seller, stack size
- Status filter buttons, pagination (10 per page)

**Bazaar listings section:**
- Active bazaar listings for this item (seller, price, quantity, zone, last seen)
- Historical bazaar price summary

#### Bazaar Activity Page (`/bazaar`)

- Server selector
- Zone grouping: shows zones with active bazaars, count of players per zone
- Player list per zone: character name, last seen timestamp
- Click a player to see their known bazaar contents (if previously browsed by any addon user)

### Sidebar Changes

No sidebar links for economy pages — they're public pages outside the authenticated dashboard. They get their own top-level routes and a lightweight public nav header (similar to the landing page layout, but with item search functionality).

---

## Sub-spec C: Bazaar Tracking

### Bazaar Presence (Passive)

#### Data Model: BazaarPresence

| Column | Type | Notes |
|--------|------|-------|
| Id | long | PK, auto-increment |
| ServerId | int | FK → GameServer |
| PlayerName | string | Bazaar owner character name |
| Zone | string | Zone where player was seen |
| IsActive | bool | Currently has bazaar open |
| FirstSeenAt | DateTimeOffset | When first detected |
| LastSeenAt | DateTimeOffset | Most recent detection |
| ReportedByUserId | GUID | FK → User |

**Upsert logic:** Match on `(PlayerName, ServerId)` where `IsActive = true`:
- If found: update `LastSeenAt`, `Zone`
- If not found: create new record with `IsActive = true`
- Players no longer seen with bazaar flag: mark `IsActive = false`

**Staleness expiry:** A background job runs every 15 minutes and sets `IsActive = false` on any `BazaarPresence` where `LastSeenAt` is older than 30 minutes. This handles cases where the reporting player logs out or zones, so no further updates arrive.

**Indexes:**
- Index on `(ServerId, IsActive, Zone)` for the bazaar activity page
- Index on `(PlayerName, ServerId)` for upsert lookups

#### Addon: Passive Bazaar Scan

On each sync timer tick (every 5-15 minutes), the addon:

1. Calls `windower.ffxi.get_mob_array()` to get nearby entities
2. Filters for players with the bazaar flag set
3. Collects: player name, zone (from `windower.ffxi.get_info().zone`)
4. POSTs to `/api/economy/bazaar/presence`

This runs automatically alongside the existing character sync — no user interaction required.

### Bazaar Contents (Manual Browse)

#### Data Model: BazaarListing

| Column | Type | Notes |
|--------|------|-------|
| Id | long | PK, auto-increment |
| ItemId | int | FK → GameItem |
| ServerId | int | FK → GameServer |
| SellerName | string | Bazaar owner character name |
| Price | int | Listed price in gil |
| Quantity | int | Number of items |
| Zone | string | Where the player was when browsed |
| IsActive | bool | Still listed as of last scan |
| FirstSeenAt | DateTimeOffset | When first appeared |
| LastSeenAt | DateTimeOffset | Last time seen in bazaar |
| ReportedByUserId | GUID | FK → User |

**Lifecycle:**
1. Player opens another player's bazaar → game sends packet with contents
2. Addon captures packet and POSTs to `/api/economy/bazaar`
3. Server upserts: match on `(SellerName, ItemId, ServerId, Price)` where `IsActive = true`
   - If found: update `LastSeenAt` and `Quantity` (quantity may change as items sell)
   - If not found: create new listing with `IsActive = true`
4. Any active listings for that seller NOT in the current scan: mark `IsActive = false` (item was removed)

**Indexes:**
- Index on `(ItemId, ServerId, IsActive)` for active listings by item
- Index on `(SellerName, ServerId, IsActive)` for seller upsert lookups

#### Addon: Bazaar Contents Capture

Registers for incoming bazaar contents packet (`0x109`). When the user opens another player's bazaar:

1. Parse packet for: seller name, list of items (item ID, price, quantity)
2. Get current zone from `windower.ffxi.get_info()`
3. POST to `/api/economy/bazaar`

#### API Endpoints

`POST /api/economy/bazaar/presence` — API Key auth

```json
{
  "server": "Asura",
  "zone": "Port Jeuno",
  "players": [
    { "name": "PlayerA" },
    { "name": "PlayerB" }
  ]
}
```

`POST /api/economy/bazaar` — API Key auth

```json
{
  "server": "Asura",
  "sellerName": "PlayerA",
  "zone": "Port Jeuno",
  "items": [
    { "itemId": 4096, "price": 1500, "quantity": 3 },
    { "itemId": 4097, "price": 500, "quantity": 12 }
  ]
}
```

Rate limiting: shares the economy rate pool (120 req/hr per API key).

---

## API Summary

### Public Endpoints (no auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/items | Browse/search item catalog |
| GET | /api/items/{id} | Item detail with full stats |
| GET | /api/items/{id}/prices | Price history for an item (query: server, days) |
| GET | /api/items/{id}/prices/all | Cross-server price comparison |
| GET | /api/items/{id}/bazaar | Bazaar listings for an item (query: server) |
| GET | /api/economy/bazaar/active | Active bazaar presences (query: server, zone) |

### Ingestion Endpoints (API key auth, 120 req/hr)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/economy/ah | Submit AH sales batch |
| POST | /api/economy/bazaar | Submit bazaar contents |
| POST | /api/economy/bazaar/presence | Submit bazaar presence scan |

---

## Cross-cutting Concerns

**EquippedGear FK:** The existing `EquippedGear` model has an `ItemId` field (int). Once `GameItem` is implemented, add a FK relationship from `EquippedGear.ItemId` to `GameItem.ItemId` so character gear displays can show full item stats, icons, and link to the item detail page.

**Price endpoint pagination:** `GET /api/items/{id}/prices` supports query parameters: `?server=Asura&days=30&page=1&pageSize=25`. Default: 30 days, page 1, 25 per page. Response includes `totalCount` for pagination UI.

## Implementation Order

1. **Sub-spec A** — Item database schema, seeding from Windower Resources, image downloads, AH ingestion API endpoint, addon AH packet capture
2. **Sub-spec B** — Public frontend pages (item search/browse, item detail with price charts, bazaar activity placeholders)
3. **Sub-spec C** — Bazaar data models, ingestion endpoints, addon bazaar packet + presence scanning, connect bazaar UI
