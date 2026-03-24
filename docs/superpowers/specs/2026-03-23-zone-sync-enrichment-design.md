# Zone Sync & Enrichment Design

## Goal

Replace the static 48-zone JSON with a server-persisted zone catalog covering all ~290 FFXI zones. Enrich the zone viewer with 2D minimap overlays and NPC/enemy spawn markers. Add a client-side VTABLE/FTABLE scanner to discover zone DATs not in the seed data.

## Architecture

Three-layer approach:

1. **Server-side sync provider** imports seed data (CSV + LandSandBoat) into a Zone table, exposed via `/api/zones`
2. **Client-side scanner** discovers additional zone geometry DATs via VTABLE/FTABLE probing, pushes results to server
3. **Client-side parsers** read minimap textures and spawn positions on-the-fly from DAT paths stored in the Zone table

Data flows hybrid: seed data is server-sourced (CSV + GitHub), scanner results are client-to-server, and minimap/spawn parsing is purely client-side (File System Access API).

## Data Model

### Zone Table

| Column | Type | Source |
|--------|------|--------|
| `Id` | int (PK, not auto-increment) | CSV `ID` column (FFXI zone ID) |
| `Name` | string | CSV `NAME`, fallback to LandSandBoat |
| `ModelPath` | string? | CSV `MODEL` -- zone geometry DAT |
| `DialogPath` | string? | CSV `DIALOG` |
| `NpcPath` | string? | CSV `NPCs` -- spawn data DAT |
| `EventPath` | string? | CSV `EVENTS` |
| `MapPaths` | string? | Semicolon-delimited minimap DAT paths from xurion/ffxi-map-dats |
| `Expansion` | string? | Derived from ROM volume or LandSandBoat `zone_settings` |
| `Region` | string? | From LandSandBoat `zone_settings` |
| `IsDiscovered` | bool | `false` = seed data, `true` = scanner-found. If a scanner-discovered zone is later matched to seed data during re-sync, flipped to `false`. |

### API Endpoints

- `GET /api/zones` -- public, returns full zone list for frontend browser
- `POST /api/admin/zones/discovered` -- admin, accepts scanner-discovered zones

## Server-Side Sync Provider

New "Zone Data" sync provider on the admin data page, following existing SSE progress streaming pattern.

### Phase 1: CSV Seed Import

Reads `public/data/zone-seed-data.csv` (~290 entries with ID, NAME, MODEL, DIALOG, NPCs, EVENTS, MapPaths columns). Upserts into Zone table. Skips entries with empty names or models, and completely blank rows (IDs 286-287).

ROM volume prefix provides an initial expansion hint during Phase 1:

- `ROM/` -> Original
- `ROM2/` -> Rise of the Zilart
- `ROM3/` -> Chains of Promathia
- `ROM4/` -> Treasures of Aht Urhgan
- `ROM5/` -> Wings of the Goddess
- `ROM9/` -> Seekers of Adoulin

**Important:** Many post-Adoulin zones use `ROM/` with high folder numbers (e.g., ROM/240/, ROM/254/, ROM/258/, ROM/280/, ROM/303/, ROM/332/, ROM/342/, ROM/354/) rather than higher ROM volumes. ROM6-8 do not exist. The ROM prefix alone cannot determine expansion for these zones. Phase 2 (LandSandBoat enrichment) is the authoritative source for expansion data -- the ROM prefix is a fallback hint only, applied when LandSandBoat data is unavailable.

### Phase 2: LandSandBoat Enrichment

Fetches `zone_settings.sql` from LandSandBoat GitHub (same pattern as existing `item_equipment.sql` and `mob_pools.sql` fetches). Matches by zone ID, fills in Region and any missing Name or Expansion values.

Progress reporting tagged with `[Phase 1/2 — CSV Import]` and `[Phase 2/2 — LandSandBoat Enrichment]` (em-dash, matching existing sync provider convention).

### Sync Registration

Register as keyed singleton in `Program.cs` following existing pattern:

```csharp
builder.Services.AddKeyedSingleton<ISyncProvider, ZoneSyncProvider>("zones");
```

Provider ID `"zones"` used in `SyncContext.tsx` for SSE stream and sync control.

### CSV Access

The seed CSV is bundled as an embedded resource in the API project (or fetched via HTTP from the frontend's static files at build/deploy time), following whichever pattern the existing sync providers use for static data. The existing ItemSyncProvider fetches from GitHub URLs -- if the CSV is committed to the repo, it can be read from disk relative to the content root, or served as a static file and fetched via HTTP.

## Seed Data

### Zone Seed CSV

`ZoneDats.csv` moved to `public/data/zone-seed-data.csv`. New `MapPaths` column added with semicolon-delimited minimap DAT paths from xurion/ffxi-map-dats ZONES.md.

Source data:
- Zone ID, name, model/dialog/NPC/event DAT paths: existing `ZoneDats.csv` (~290 entries)
- Minimap DAT paths: https://raw.githubusercontent.com/xurion/ffxi-map-dats/refs/heads/master/ZONES.md
- Cross-referenced and verified: all 48 entries in existing `zone-paths.json` match CSV MODEL paths (100% match)

### Data Quality Notes

- 9 CSV entries have empty names (IDs 133, 189, 199, 210, 214, 219, 229, 278, 279)
- 2 entries have empty MODEL paths (Silver Knife ID 283, plus completely blank rows 286-287)
- Many zones have multiple minimap DATs (multi-floor dungeons, e.g. Delkfutt's Tower has 16)

## Client-Side Zone Scanner

Discovers zone DATs not present in seed data. Triggered from "Scan Local Files" button on the Zone Data sync card (requires FFXI directory via File System Access API).

### Algorithm

1. Load VTABLE/FTABLE using existing `FileTableResolver`
2. Iterate all file IDs that resolve to valid ROM paths (skip files under 1KB)
3. For each file, read the block chain by walking DATHEAD entries (8 bytes: 4-char name + packed uint32 with type and next-offset). Walk up to 20 blocks per file -- enough to detect MZB/MMB without reading the full chain.
4. Extract block types via `packed & 0x7F`. Check for presence of both MZB (0x1C) and MMB (0x2E) block types.
5. Files containing both = zone geometry DAT
6. Compare discovered paths against zones already in DB
7. Push new discoveries to `POST /api/admin/zones/discovered` with `IsDiscovered = true`

### Discovered Zone Endpoint

`POST /api/admin/zones/discovered` accepts a batch of discovered zones:

```
Request: { zones: [{ modelPath: string }] }
Response: { created: number, existing: number }
```

Requires admin auth (same as `AdminSyncController`). Idempotent -- if a zone with the same `ModelPath` already exists, it is skipped (counted as `existing`). New zones are created with `IsDiscovered = true`, an auto-assigned negative ID (to avoid collision with FFXI zone IDs), and `Name` set to the DAT path until manually updated.

### Error Handling

- Missing VTABLE.DAT or FTABLE.DAT: show error message prompting user to verify their FFXI directory
- Corrupted DAT mid-scan: skip file, log warning, continue scanning
- File System Access API permission denied: prompt re-authorization

### Limitations

Scanner finds geometry DATs but cannot determine zone name, NPC path, dialog path, event path, or map paths. Discovered zones show their DAT path as identifier until manually named or matched. Expected scan time: 30-60 seconds with progress reporting.

## Minimap Parsing & Display

### Texture Parsing

Extend `TextureParser.ts` to handle 0xB1 flag ("menumap" format). These DATs contain 2D map images in a format similar to 0xA1 but with a different header layout. Output is standard RGBA image data.

### Map DAT Paths

Sourced from xurion/ffxi-map-dats, stored in Zone.MapPaths column as semicolon-delimited list. Many zones have multiple maps for different floors/areas.

### Viewer Integration

`MinimapOverlay` component positioned in top-right corner of zone viewport. Shows the minimap image for the current zone. Floor selector dropdown when a zone has multiple maps.

**v1 scope:** Parse and display minimap image with floor selector. Camera position tracking dot on minimap is a stretch goal (requires research into coordinate mapping between minimap image space and zone world space).

## Spawn Data Parsing

### Binary Format

NPC DATs (from CSV `NPCs` column) contain entity spawn records. Each entry expected to contain:
- Entity ID (uint16/uint32)
- Position: X, Y, Z (float32 x 3)
- Rotation (float32)
- Group/family ID for cross-referencing with mob_pools

Exact binary layout requires research during implementation. Known references for the format:
- LandSandBoat `mob_spawn_points.sql` (contains zone-indexed spawn positions for cross-referencing)
- DarkStar/LandSandBoat entity spawn loading code
- Community FFXI data mining documentation

If the binary format proves too complex or undocumented, the fallback plan is to use LandSandBoat's `mob_spawn_points.sql` as a server-side data source instead of client-side DAT parsing. This would provide spawn positions without requiring the user's local FFXI install.

### Parser

New `SpawnParser.ts` in `src/lib/ffxi-dat/`. Reads NPC DAT path from Zone record, extracts positions and entity references. Cross-references entity IDs against existing NpcPool table for names and model references.

### Viewer Integration

Toggle-able spawn markers in the 3D zone viewer. Each marker is a billboard or sphere at the spawn XYZ position. Hover shows entity name (from NpcPool cross-reference).

**v1 scope:** Position markers with names. Rendering actual NPC models at spawn points is a stretch goal.

## Frontend Changes

### Zone Browser (`/zones`)

1. **Data source:** Replace static `zone-paths.json` with `GET /api/zones`
2. **Expansion tabs:** Dynamically built from zone data (Original, RoZ, CoP, ToAU, WotG, SoA, plus post-expansion)
3. **Minimap overlay:** `MinimapOverlay` component, top-right corner, floor selector for multi-level zones
4. **Spawn markers:** Toolbar toggle, reads NPC DAT on demand, renders markers in 3D scene
5. **Zone info panel:** Region, expansion, spawn count, map floor count

### Admin Page

6. **Zone Data sync card:** "Sync Now" for server-side CSV+LandSandBoat import. "Scan Local Files" for client-side VTABLE/FTABLE scanner.
7. **Game Data Health:** Zone stats -- total zones, with models, with NPC data, with map data, scanner-discovered

## File Structure

### New Server-Side

- `Zone.cs` -- entity model
- `ZoneController.cs` -- API endpoints
- `ZoneSyncProvider.cs` -- sync provider (CSV + LandSandBoat)
- DB migration for Zone table

### New Client-Side

- `src/lib/ffxi-dat/SpawnParser.ts` -- NPC DAT spawn extractor
- `src/lib/ffxi-dat/MinimapParser.ts` -- 0xB1 menumap texture parser
- `src/lib/ffxi-dat/ZoneScanner.ts` -- VTABLE/FTABLE zone discovery
- `src/components/zone/MinimapOverlay.tsx` -- minimap overlay with floor selector
- `src/components/zone/SpawnMarkers.tsx` -- Three.js spawn marker billboards

### Modified Client-Side

- `src/pages/ZoneBrowserPage.tsx` -- API data source, minimap/spawn integration
- `src/components/zone/ThreeZoneViewer.tsx` -- accept spawn markers prop
- `src/lib/ffxi-dat/TextureParser.ts` -- add 0xB1 flag handling
- `src/pages/AdminItemsPage.tsx` -- Zone Data sync card + health stats
- `src/context/SyncContext.tsx` -- register zone sync provider

### Moved

- `ZoneDats.csv` -> `public/data/zone-seed-data.csv` (add MapPaths column)

### Deleted

- `public/data/zone-paths.json` -- replaced by API endpoint
- `scripts/generate-zone-paths.mjs` -- no longer needed
