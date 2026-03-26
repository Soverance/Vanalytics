# Session Tracker & Inventory Collector Design

**Date:** 2026-03-25
**Status:** Approved

## Overview

Two new Vanalytics features expanding the Windower addon's data capture capabilities:

1. **Session Tracker** — Command-driven capture mode (`//va session start/stop`) that records raw combat and economy events during play sessions via chat log parsing, written to local files for crash safety and batch-uploaded to the API for rich frontend analysis.

2. **Inventory Collector** — Passive capture of all items across all inventory bags during normal syncs, with change detection to upload only diffs. Stores full inventory state and historical changes for future analysis features (NM pop tracking, weapon progress, gear acquisition timelines).

---

## Addon Architecture

### Module Structure

```
vanalytics/
├── vanalytics.lua          -- main entrypoint, commands, events (existing, trimmed)
├── session.lua             -- session lifecycle, chat log parser, event buffer, local file writer
├── inventory.lua           -- inventory snapshot, diff calculation, upload
└── settings.xml            -- existing config
```

### session.lua

**Responsibilities:**
- `start_session()` / `stop_session()` — lifecycle management
- Registers a `incoming text` Windower event to parse chat log lines during active sessions
- Categorizes each parsed line into an event type (melee_damage, spell_damage, healing, item_drop, gil_gain, skill_used, mob_killed, etc.)
- Each event is a small table: `{type, timestamp, source, target, value, ability, item_id, zone}`
- Events are appended to a local JSON-lines file (`sessions/{characterName}_{YYYY-MM-DD_HH-MM-SS}.jsonl`)
- Upload runs on session stop only — the local file is the primary store during the session. This avoids synchronous HTTP freezes during active combat (the existing `socket.http`/`ssl.https` calls are blocking and would cause noticeable game hitches every 30 seconds). The full file is batch-uploaded when the player runs `//va session stop`.
- If the session file exceeds a configurable threshold (default 5000 events), the addon will also flush mid-session during the normal sync timer interval (every 5-15 min) to limit the upload size at session end.

### inventory.lua

**Responsibilities:**
- `read_full_inventory()` — reads all bags via `windower.ffxi.get_items()` (inventory, safe, storage, locker, satchel, sack, case, wardrobes 1-8)
- `compute_diff(previous, current)` — returns lists of added/removed/changed items
- Stores the previous snapshot in memory for diffing
- Called during the normal sync timer (alongside existing character state sync)
- Uploads diffs to `POST /api/sync/inventory`

---

## Chat Log Parsing

The parser uses Lua `string.match` against incoming chat lines during active sessions. The `incoming text` Windower event provides the signature `function(original, modified, original_mode, modified_mode, blocked)`. The parser filters on `original_mode` to only process battle-relevant chat channels.

### Relevant Chat Mode IDs

The following Windower chat mode ranges are captured:

- **20-44** — Battle messages (melee at 36, ranged, spell damage, misses, resists, etc.)
- **110** — Experience/limit/capacity point gains
- **121** — Item drops / treasure pool
- **123** — Gil gains/losses
- **127** — Skillchain/magic burst messages
- **150-151** — System messages (defeats, falls to the ground)

All other modes (party chat, linkshell, tells, system, etc.) are ignored. Unrecognized lines within valid modes are silently skipped — some combat message variants (e.g., multi-hit weapon skill sub-messages, additional effect damage) will be missed in the initial implementation, which is acceptable.

### Event Types and Patterns

**Melee/Ranged Damage Dealt:**
- `{Player} hits {Target} for {N} points of damage.`
- `{Player}'s ranged attack hits {Target} for {N} points of damage.`
- Critical variants: `...scores a critical hit!...for {N} points of damage.`

**Spell/Ability Damage:**
- `{Player} casts {Spell}. {Target} takes {N} points of damage.`
- `{Player} uses {Ability}. {Target} takes {N} points of damage.`
- Weapon skills: same pattern with WS name

**Damage Received:**
- Same patterns as above but with player as target

**Healing:**
- `{Player} casts {Spell}. {Target} recovers {N} HP.`
- `{Player} uses {Ability}. {Target} recovers {N} HP.`

**Mob Kills:**
- `{Player} defeats {Target}.`
- `{Target} falls to the ground.`

**Item Drops:**
- `{Player} obtains a {Item}.` / `{Player} obtains {N} {Item}.`
- `You find a {Item} on {Target}.`

**Gil:**
- `{Player} obtains {N} gil.`
- `You lose {N} gil.`

**Skillchains/Magic Bursts:**
- `Skillchain: {Element}.` (followed by damage line)
- `Magic Burst! {Target} takes {N} points of damage.`

**Experience/Points:**
- `{Player} gains {N} experience points.`
- `{Player} gains {N} limit points.`
- `{Player} gains {N} capacity points.`

The parser tracks the player's own name (from `windower.ffxi.get_player().name`) to distinguish between damage dealt and damage received.

### Party Member Events

The parser captures events from all sources visible in the chat log, including party and alliance members. The `Source` field on each event identifies who performed the action. This enables future party DPS comparisons. Events are not filtered to the player only — the frontend can filter by source when displaying per-player breakdowns.

---

## Data Models

### Session Entities

```
Session
├── Id (Guid)
├── CharacterId (FK → Character)
├── StartedAt (DateTime)
├── EndedAt (DateTime, nullable — null while active)
├── Zone (string — zone where session started, for display/listing purposes only; the authoritative zone for each event is in SessionEvent.Zone)
├── Status (enum: Active, Completed, Abandoned)
└── Navigation: Character, Events

SessionEvent
├── Id (long, auto-increment — high volume table)
├── SessionId (FK → Session)
├── EventType (enum: MeleeDamage, RangedDamage, SpellDamage, AbilityDamage,
│              DamageReceived, Healing, ItemDrop, GilGain, GilLoss,
│              MobKill, Skillchain, MagicBurst, ExpGain, LimitGain, CapacityGain)
├── Timestamp (DateTime)
├── Source (string — who performed the action)
├── Target (string — mob or player affected)
├── Value (long — damage/heal/gil amount, XP amount; long to safely handle gil values up to 999,999,999 and aggregate sums)
├── Ability (string, nullable — spell/WS/JA name)
├── ItemId (int, nullable — for drops)
├── Zone (string)
└── Navigation: Session
```

### Inventory Entities

```
CharacterInventory
├── Id (long, auto-increment)
├── CharacterId (FK → Character)
├── ItemId (int — FFXI item ID)
├── Bag (enum: Inventory, Safe, Storage, Locker, Satchel, Sack,
│         Case, Wardrobe, Wardrobe2, Wardrobe3, Wardrobe4,
│         Wardrobe5, Wardrobe6, Wardrobe7, Wardrobe8)
├── SlotIndex (int — position within the bag, needed to distinguish multiple stacks of the same item)
├── Quantity (int)
├── LastSeenAt (DateTime)
└── Navigation: Character

InventoryChange
├── Id (long, auto-increment)
├── CharacterId (FK → Character)
├── ItemId (int)
├── Bag (enum — same as above)
├── SlotIndex (int — matches CharacterInventory.SlotIndex to identify which stack changed)
├── ChangeType (enum: Added, Removed, QuantityChanged)
├── QuantityBefore (int)
├── QuantityAfter (int)
├── ChangedAt (DateTime)
└── Navigation: Character
```

### Indexing Strategy

- `SessionEvent`: composite index on `(SessionId, EventType)` and `(SessionId, Timestamp)`
- `CharacterInventory`: unique index on `(CharacterId, ItemId, Bag, SlotIndex)`
- `InventoryChange`: index on `(CharacterId, ChangedAt)`

---

## API Endpoints

### Addon Endpoints (API Key Auth)

**SessionController** — `api/session`

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/start` | Creates a new Session record, returns `sessionId`. Request body: `{characterName, server, zone}`. Resolves character by name/server and verifies ownership via API key claims (same pattern as `SyncController`). If the character has an existing active session, it is marked as Abandoned and a new session is created. |
| POST | `/stop` | Marks active session as Completed, sets `EndedAt`. Request body: `{characterName, server}`. Verifies ownership via API key claims. Returns 404 if no active session. |
| POST | `/events` | Accepts a batch of raw events (`{characterName, server, events[]}`, max 500 events per request), writes to DB. Verifies ownership via API key claims. Returns 400 if no active session. |

Rate limiting: Uses a dedicated `SessionRateLimiter` (separate from sync and economy limiters) at 300 requests/hour per API key — sufficient headroom for mid-session flushes, start/stop calls, and retries.

**InventoryController** — `api/sync/inventory`

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/` | Accepts inventory diff payload (`{characterName, server, changes[]}`). Upserts `CharacterInventory` rows and appends `InventoryChange` history records. |

Rate limiting: 20 requests/hour (same as existing sync).

### Frontend Endpoints (JWT Auth)

**SessionsController** — `api/sessions`

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/` | List user's sessions (paginated, filterable by character/date range) |
| GET | `/{id}` | Session detail with aggregated stats (total damage, DPS, gil earned, drops, duration) |
| GET | `/{id}/events` | Paginated raw events, filterable by event type |
| GET | `/{id}/timeline` | Time-bucketed aggregations (DPS per minute, gil per minute) for charting |
| DELETE | `/{id}` | Delete a session and its events |

**CharactersController** (existing, extended) — `api/characters`

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/{id}/inventory` | Full current inventory, grouped by bag. Filterable by item name/category. |

---

## Local File Storage & Upload Pipeline

### File Structure

```
vanalytics/
└── sessions/
    └── {characterName}_{YYYY-MM-DD_HH-MM-SS}.jsonl
```

Each line is a single event with short keys for compactness:
```json
{"t":"MeleeDamage","ts":1711382400,"s":"Playerone","tg":"Goblin Smithy","v":284,"z":"Valkurm Dunes"}
```

### Write Flow

1. Chat log line parsed → event table created in memory
2. Event serialized to JSON and appended to JSONL file immediately (crash-safe)
3. A line counter tracks which lines have been uploaded

### Upload Flow

Upload occurs primarily on session stop, with optional mid-session flushes for long sessions:

**On session stop (`//va session stop`):**
1. Read entire file (or from last uploaded line if a mid-session flush occurred)
2. Batch into groups of up to 500 events
3. POST each batch to `/api/session/events`
4. On success for all batches, POST to `/api/session/stop`
5. On failure (network error, rate limit), log error — file remains on disk for manual retry or `//va session flush` command

**Mid-session flush (optional, during normal sync timer):**
1. If event count since last upload exceeds threshold (default 5000), trigger a flush
2. Same batch-and-upload logic as session stop, but does not call `/stop`
3. Advances the line counter so session stop only uploads the remainder

### File Cleanup

- Files remain on disk after upload. `//va session cleanup` deletes all session files older than 7 days.
- Session files are stored at `windower/addons/vanalytics/sessions/`.

### Edge Cases

- **Addon crash mid-session:** File persists on disk. Next session start marks the old server-side session as `Abandoned`.
- **Network outage during session:** Events keep writing to file. Uploads resume when connectivity returns.
- **Player zones during session:** Session continues across zones. Each event records its zone.

---

## Frontend

### Sessions List Page (`/sessions`)

- Table of past sessions: Date, Character, Zone, Duration, Total Damage, Gil Earned, Drops
- Filterable by character and date range
- Sortable by any column
- Paginated

### Session Detail Page (`/sessions/{id}`)

**Header:** character name, zone, start/end time, total duration

**Summary cards:** Total Damage, DPS Average, Gil Earned, Gil/Hour, Items Dropped, Mobs Killed, XP Gained

**Tab 1 — Timeline:**
- Line chart: DPS over time (damage per minute buckets)
- Line chart: Gil/hour rate over time
- Powered by `/api/sessions/{id}/timeline`

**Tab 2 — Combat:**
- Damage breakdown by type (melee, ranged, spell, ability, weaponskill) — bar or pie chart
- Top damage abilities table (ability name, total damage, times used, avg damage)
- Healing summary (total healed, spells used)
- Skillchain/magic burst count and damage

**Tab 3 — Loot:**
- Table of all items obtained (item name, quantity, time obtained)
- Gil gains/losses log
- Total net gil

**Tab 4 — Raw Events:**
- Scrollable event log with type filter checkboxes
- Paginated via `/api/sessions/{id}/events`

### Character Detail Page (Extended)

- New "Inventory" tab alongside existing Jobs and Crafting tabs
- Inventory grouped by bag, each bag collapsible
- Items displayed as list with icon, name, quantity
- Search/filter across all bags

---

## New Addon Commands

```
//va session start     — Start a performance tracking session
//va session stop      — Stop the active session and upload remaining data
//va session status    — Show current session info (duration, events captured, upload status)
//va session flush     — Manually upload buffered events without stopping the session
//va session cleanup   — Delete session files older than 7 days
```

---

## Implementation Notes

### EF Core Migration

Four new entities (`Session`, `SessionEvent`, `CharacterInventory`, `InventoryChange`) and four new enums (`SessionStatus`, `SessionEventType`, `InventoryBag`, `InventoryChangeType`) require a new EF Core migration added to `Vanalytics.Data/Migrations/`.

### New Enums

```
SessionStatus: Active, Completed, Abandoned
SessionEventType: MeleeDamage, RangedDamage, SpellDamage, AbilityDamage,
                  DamageReceived, Healing, ItemDrop, GilGain, GilLoss,
                  MobKill, Skillchain, MagicBurst, ExpGain, LimitGain, CapacityGain
InventoryBag: Inventory, Safe, Storage, Locker, Satchel, Sack, Case,
              Wardrobe, Wardrobe2, Wardrobe3, Wardrobe4, Wardrobe5,
              Wardrobe6, Wardrobe7, Wardrobe8
InventoryChangeType: Added, Removed, QuantityChanged
```
