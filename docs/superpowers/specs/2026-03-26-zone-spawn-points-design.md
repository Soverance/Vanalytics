# Zone Spawn Points

Render NPC and monster spawn locations in the 3D zone viewer, sourced from LandSandBoat server data.

## Data Model

### New Entity: `ZoneSpawn`

| Field      | Type   | Notes                                      |
|------------|--------|--------------------------------------------|
| Id         | int    | PK, auto-increment                         |
| ZoneId     | int    | FK to Zone. Indexed.                       |
| PoolId     | int    | FK to NpcPool (via NpcPool.PoolId)         |
| MobName    | string | Denormalized from spawn SQL for display    |
| X          | float  | World-space X coordinate                   |
| Y          | float  | World-space Y coordinate                   |
| Z          | float  | World-space Z coordinate                   |
| Rotation   | float  | Facing direction in radians                |
| CreatedAt  | DateTimeOffset | Standard audit field                |
| UpdatedAt  | DateTimeOffset | Standard audit field                |

Index on `ZoneId` for per-zone lookups. No unique constraint on position since multiple mobs can share a spawn point.

### Database Changes

- New `ZoneSpawns` table via EF migration.
- Register `ZoneSpawn` in `VanalyticsDbContext`.
- New `ZoneSpawnConfiguration` in Vanalytics.Data/Configurations.

## Sync: ZoneSyncProvider Phase 3

Add a third phase to the existing `ZoneSyncProvider` that downloads and parses `mob_spawn_points.sql` from LandSandBoat.

### Source

URL: `https://raw.githubusercontent.com/LandSandBoat/server/base/sql/mob_spawn_points.sql`

Expected INSERT format (based on LandSandBoat conventions):
```sql
INSERT INTO `mob_spawn_points` VALUES (mobid, zoneid, 'mobname', pos_x, pos_y, pos_z, pos_rot, ...);
```

Note: The exact column order will be verified against the actual SQL file during implementation. The regex will be adjusted to match the real format.

### Sync Logic

1. Fetch the SQL file via HttpClient (same pattern as zone_settings.sql fetch).
2. Parse INSERT tuples with regex.
3. Map `mobid` to NpcPool.PoolId where possible (for the isMonster flag and model data).
4. Load existing ZoneSpawns from DB, compare by (ZoneId, PoolId, X, Y, Z) composite.
5. Batch upsert new/changed records, delete spawns no longer present in source.
6. Report progress: added/updated/removed/skipped counts.

### Ordering

Phase 3 runs after Phase 1 (CSV import) and Phase 2 (LSB enrichment) so that Zone records exist before spawns reference them. NpcPool data is synced by ItemSyncProvider separately; if a PoolId doesn't match an NpcPool record, the spawn is still stored (the join is optional for display).

## API

### `GET /api/zones/{id}/spawns`

No authentication required. Returns all spawns for the given zone.

**Response:**
```json
[
  {
    "poolId": 1234,
    "name": "Goblin Smithy",
    "x": 120.5,
    "y": -10.2,
    "z": 45.0,
    "rotation": 1.57,
    "isMonster": true
  }
]
```

The `isMonster` field is resolved by joining with `NpcPool` on PoolId. If no NpcPool match exists, default to `true`.

Added to `ZonesController` as a new action method.

## Frontend

### Spawn Loading

When the user toggles the existing "Spawns" button:
- Fetch `/api/zones/{zoneId}/spawns` (replace the current DAT-based stub).
- Cache results per zone to avoid re-fetching when toggling.
- Remove the `parseSpawnDat` call and the client-side DAT loading for spawns.

### Default View: All Spawns as Markers

When spawns are toggled on with no filter active:
- Render colored sphere markers at each spawn position.
- Red spheres for monsters (`isMonster: true`), blue for NPCs.
- Hover tooltip shows the mob name.
- Markers are simple Three.js meshes (shared geometry + instancing if needed for performance).

### Filtered View: Search + Full Models

A search/filter input appears in the spawn toolbar area when spawns are toggled on.

When the user types a mob name:
- Filter spawns to matching results (case-insensitive substring match).
- Non-matching markers are hidden.
- Matching spawns render as **full 3D NPC models** instead of spheres:
  - Load model DAT using existing pipeline (NpcPool.ModelData + npc-model-paths.json).
  - Place at spawn x/y/z with correct rotation.
  - Play idle animation if skeleton data is available.
  - Models are loaded on-demand, only for the filtered set.
- **Skybeam highlights** automatically appear on filtered spawns:
  - Tall, narrow, semi-transparent vertical columns extending upward from each spawn.
  - Red for monsters, blue for NPCs.
  - Visible from long distance in fly camera mode.
  - Rendered as a cylinder or line mesh with emissive/additive material.
  - Toggle button to turn skybeams off while filter is active.

### Info Popup

Clicking a spawn marker or model opens a floating info card overlaying the 3D viewport:
- NPC/monster name
- Pool ID
- World coordinates (x, y, z)
- Monster/NPC type indicator
- "View in NPC Browser" link that navigates to the NPC browser page filtered to that pool ID.

Clicking outside the card or pressing Escape closes it.

### Component Structure

- **SpawnMarkers.tsx** — refactored to render instanced sphere markers from API data instead of DAT-parsed data. Handles hover tooltips.
- **SpawnModelRenderer.tsx** — new component that loads and renders full NPC models for filtered spawns. Reuses model loading from the NPC browser pipeline.
- **SpawnSkybeams.tsx** — new component rendering vertical highlight beams on filtered spawns.
- **SpawnInfoCard.tsx** — new component for the floating popup on click.
- **SpawnToolbar.tsx** — new component with the search input and skybeam toggle, placed in the zone viewer overlay area.

### State Management

All spawn state lives in `ZoneBrowserPage.tsx`:
- `spawns: ZoneSpawnDto[]` — raw API response, cached per zone.
- `showSpawns: boolean` — existing toggle.
- `spawnFilter: string` — search input value.
- `selectedSpawn: ZoneSpawnDto | null` — for info popup.
- `showSkybeams: boolean` — defaults to true when filter is active, togglable.

Filtered spawns are derived: `spawns.filter(s => s.name.toLowerCase().includes(spawnFilter.toLowerCase()))`.

## Coordinate Mapping

FFXI zone geometry in the 3D viewer uses a Y-flip (Math.PI rotation on root group). Spawn coordinates from LandSandBoat use the same coordinate system as the game server. The spawn marker positions must match the zone geometry transform:
- X maps directly.
- Y is negated (due to the viewer's Y-flip).
- Z is negated (due to the viewer's Y-flip).

This matches how existing geometry instance transforms are extracted in MzbParser: `x = transform[12], y = -transform[13], z = -transform[14]`.

## Out of Scope

- Rendering full models for ALL spawns simultaneously (performance concern — markers only for unfiltered view).
- Spawn respawn timers or dynamic state (this is static positional data).
- NPC dialog or drop tables (future NPC browser enhancement).
- Client-side DAT parsing for spawn data (replaced entirely by server-side API).
