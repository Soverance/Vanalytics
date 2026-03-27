# Zone Spawn Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render NPC/monster spawn locations in the 3D zone viewer, sourced from LandSandBoat server data, with search filtering, full 3D model rendering for filtered results, skybeam highlights, and info popups linking to the NPC browser.

**Architecture:** New `ZoneSpawn` entity synced in ZoneSyncProvider Phase 3 from two LandSandBoat SQL files (`mob_spawn_points.sql` + `mob_groups.sql`). Served via a public API endpoint. Frontend replaces the DAT-based spawn stub with API-driven spawn markers, a search toolbar, on-demand NPC model loading, and skybeam highlights.

**Tech Stack:** C# / EF Core (backend), React / TypeScript / React Three Fiber (frontend), LandSandBoat SQL (data source)

**Spec:** `docs/superpowers/specs/2026-03-26-zone-spawn-points-design.md`

---

## File Map

### Backend (New)
- `src/Vanalytics.Core/Models/ZoneSpawn.cs` — entity model
- `src/Vanalytics.Data/Configurations/ZoneSpawnConfiguration.cs` — EF config
- `src/Vanalytics.Data/Migrations/<timestamp>_AddZoneSpawns.cs` — migration (generated)

### Backend (Modified)
- `src/Vanalytics.Data/VanalyticsDbContext.cs` — register DbSet
- `src/Vanalytics.Api/Services/Sync/ZoneSyncProvider.cs` — add Phase 3
- `src/Vanalytics.Api/Controllers/ZonesController.cs` — add spawns endpoint

### Frontend (New)
- `src/Vanalytics.Web/src/components/zone/SpawnToolbar.tsx` — search input + skybeam toggle
- `src/Vanalytics.Web/src/components/zone/SpawnInfoCard.tsx` — click popup
- `src/Vanalytics.Web/src/components/zone/SpawnSkybeams.tsx` — vertical highlight beams
- `src/Vanalytics.Web/src/components/zone/SpawnModelRenderer.tsx` — full 3D NPC models for filtered spawns

### Frontend (Modified)
- `src/Vanalytics.Web/src/types/api.ts` — add ZoneSpawnDto type
- `src/Vanalytics.Web/src/components/zone/SpawnMarkers.tsx` — rewrite for API data, add hover tooltips and click handling
- `src/Vanalytics.Web/src/components/zone/ThreeZoneViewer.tsx` — update props, add new spawn components
- `src/Vanalytics.Web/src/pages/ZoneBrowserPage.tsx` — replace DAT loading with API fetch, add spawn state/toolbar

### Frontend (Remove)
- `src/Vanalytics.Web/src/lib/ffxi-dat/SpawnParser.ts` — delete (replaced by API)

---

## Task 1: ZoneSpawn Entity and Database Migration

**Files:**
- Create: `src/Vanalytics.Core/Models/ZoneSpawn.cs`
- Create: `src/Vanalytics.Data/Configurations/ZoneSpawnConfiguration.cs`
- Modify: `src/Vanalytics.Data/VanalyticsDbContext.cs`

- [ ] **Step 1: Create the ZoneSpawn entity**

```csharp
// src/Vanalytics.Core/Models/ZoneSpawn.cs
namespace Vanalytics.Core.Models;

public class ZoneSpawn
{
    public int Id { get; set; }
    public int ZoneId { get; set; }
    public int GroupId { get; set; }
    public int? PoolId { get; set; }
    public string MobName { get; set; } = string.Empty;
    public float X { get; set; }
    public float Y { get; set; }
    public float Z { get; set; }
    public float Rotation { get; set; }
    public int MinLevel { get; set; }
    public int MaxLevel { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
```

- [ ] **Step 2: Create the EF configuration**

```csharp
// src/Vanalytics.Data/Configurations/ZoneSpawnConfiguration.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class ZoneSpawnConfiguration : IEntityTypeConfiguration<ZoneSpawn>
{
    public void Configure(EntityTypeBuilder<ZoneSpawn> builder)
    {
        builder.HasKey(s => s.Id);
        builder.HasIndex(s => s.ZoneId);
        builder.HasIndex(s => s.PoolId);
        builder.Property(s => s.MobName).HasMaxLength(64).IsRequired();
    }
}
```

- [ ] **Step 3: Register DbSet in VanalyticsDbContext**

Add to the DbSet declarations in `src/Vanalytics.Data/VanalyticsDbContext.cs`:

```csharp
public DbSet<ZoneSpawn> ZoneSpawns => Set<ZoneSpawn>();
```

Add the using if not already present:
```csharp
using Vanalytics.Core.Models;
```

- [ ] **Step 4: Generate the EF migration**

Run from `src/Vanalytics.Api/`:
```bash
dotnet ef migrations add AddZoneSpawns --project ../Vanalytics.Data
```

- [ ] **Step 5: Commit**

```bash
git add src/Vanalytics.Core/Models/ZoneSpawn.cs src/Vanalytics.Data/Configurations/ZoneSpawnConfiguration.cs src/Vanalytics.Data/VanalyticsDbContext.cs src/Vanalytics.Data/Migrations/
git commit -m "feat: add ZoneSpawn entity and migration"
```

---

## Task 2: ZoneSyncProvider Phase 3 — Spawn Data Sync

**Files:**
- Modify: `src/Vanalytics.Api/Services/Sync/ZoneSyncProvider.cs`

This phase downloads two SQL files from LandSandBoat:
1. `mob_groups.sql` — maps (zoneid, groupid) → poolid
2. `mob_spawn_points.sql` — maps mobid → (groupid, mobname, pos_x, pos_y, pos_z, pos_rot, minLevel, maxLevel)

Zone ID is extracted from mobid: `(mobid >> 12) & 0xFFF`.
The groupid join connects spawn points to pool IDs.

- [ ] **Step 1: Add Phase 3 call in SyncAsync**

In the `SyncAsync` method, after the Phase 2 call, add:

```csharp
await RunSpawnSyncAsync(progress, ct);
```

- [ ] **Step 2: Add the mob_groups SQL URL constant**

Near the existing LSB URL constant, add:

```csharp
private const string LsbMobGroupsUrl = "https://raw.githubusercontent.com/LandSandBoat/server/base/sql/mob_groups.sql";
private const string LsbMobSpawnPointsUrl = "https://raw.githubusercontent.com/LandSandBoat/server/base/sql/mob_spawn_points.sql";
```

- [ ] **Step 3: Implement RunSpawnSyncAsync**

```csharp
private async Task RunSpawnSyncAsync(IProgress<SyncProgressEvent> progress, CancellationToken ct)
{
    progress.Report(new SyncProgressEvent
    {
        ProviderId = ProviderId,
        Type = SyncEventType.Progress,
        Message = "Phase 3: Syncing spawn points from LandSandBoat..."
    });

    using var scope = _scopeFactory.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
    var http = _httpClientFactory.CreateClient();
    http.Timeout = TimeSpan.FromSeconds(60);

    // Download both SQL files
    string groupsSql, spawnsSql;
    try
    {
        groupsSql = await http.GetStringAsync(LsbMobGroupsUrl, ct);
        spawnsSql = await http.GetStringAsync(LsbMobSpawnPointsUrl, ct);
    }
    catch (Exception ex)
    {
        _logger.LogWarning(ex, "Failed to download spawn SQL files from LandSandBoat");
        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = "Phase 3: Skipped — could not download spawn data."
        });
        return;
    }

    // Parse mob_groups: (groupid, poolid, zoneid, name, ...)
    // Build lookup: (zoneid, groupid) → poolid
    var groupPoolMap = new Dictionary<(int zoneId, int groupId), int>();
    var groupRegex = new Regex(@"\((\d+),(\d+),(\d+),'([^']*)'");
    foreach (Match m in groupRegex.Matches(groupsSql))
    {
        var groupId = int.Parse(m.Groups[1].Value);
        var poolId = int.Parse(m.Groups[2].Value);
        var zoneId = int.Parse(m.Groups[3].Value);
        groupPoolMap[(zoneId, groupId)] = poolId;
    }

    // Parse mob_spawn_points: (mobid, spawnslotid, mobname, polutils_name, groupid, minLevel, maxLevel, pos_x, pos_y, pos_z, pos_rot)
    var spawnRegex = new Regex(@"\((\d+),(\d+),'([^']*)','([^']*)',(\d+),(\d+),(\d+),([-\d.]+),([-\d.]+),([-\d.]+),(\d+)\)");
    var parsed = new List<ZoneSpawn>();
    foreach (Match m in spawnRegex.Matches(spawnsSql))
    {
        var mobId = int.Parse(m.Groups[1].Value);
        var zoneId = (mobId >> 12) & 0xFFF;
        var mobName = m.Groups[4].Value; // polutils_name (human-readable, has spaces)
        var groupId = int.Parse(m.Groups[5].Value);
        var minLevel = int.Parse(m.Groups[6].Value);
        var maxLevel = int.Parse(m.Groups[7].Value);
        var posX = float.Parse(m.Groups[8].Value, System.Globalization.CultureInfo.InvariantCulture);
        var posY = float.Parse(m.Groups[9].Value, System.Globalization.CultureInfo.InvariantCulture);
        var posZ = float.Parse(m.Groups[10].Value, System.Globalization.CultureInfo.InvariantCulture);
        var posRot = float.Parse(m.Groups[11].Value, System.Globalization.CultureInfo.InvariantCulture);

        // Skip placeholder positions (all 1.000 means "not yet placed")
        if (posX == 1.0f && posY == 1.0f && posZ == 1.0f) continue;

        groupPoolMap.TryGetValue((zoneId, groupId), out var poolId);

        parsed.Add(new ZoneSpawn
        {
            ZoneId = zoneId,
            GroupId = groupId,
            PoolId = poolId > 0 ? poolId : null,
            MobName = mobName.Replace('_', ' '),
            X = posX,
            Y = posY,
            Z = posZ,
            Rotation = posRot * (MathF.PI / 128f), // LSB rotation is 0-255, convert to radians
            MinLevel = minLevel,
            MaxLevel = maxLevel,
        });
    }

    // Get valid zone IDs
    var validZoneIds = await db.Zones.Select(z => z.Id).ToListAsync(ct);
    var validSet = new HashSet<int>(validZoneIds);
    parsed = parsed.Where(s => validSet.Contains(s.ZoneId)).ToList();

    // Replace all spawn data (full sync)
    var existingCount = await db.ZoneSpawns.CountAsync(ct);
    if (existingCount > 0)
    {
        db.ZoneSpawns.RemoveRange(db.ZoneSpawns);
        await db.SaveChangesAsync(ct);
    }

    var now = DateTimeOffset.UtcNow;
    foreach (var spawn in parsed)
    {
        spawn.CreatedAt = now;
        spawn.UpdatedAt = now;
    }

    // Batch insert
    const int batchSize = 1000;
    for (var i = 0; i < parsed.Count; i += batchSize)
    {
        var batch = parsed.Skip(i).Take(batchSize);
        db.ZoneSpawns.AddRange(batch);
        await db.SaveChangesAsync(ct);
    }

    _logger.LogInformation("Spawn sync: {Count} spawns across {Zones} zones (from {Groups} group mappings)",
        parsed.Count, parsed.Select(s => s.ZoneId).Distinct().Count(), groupPoolMap.Count);

    progress.Report(new SyncProgressEvent
    {
        ProviderId = ProviderId,
        Type = SyncEventType.Progress,
        Message = $"Phase 3: Synced {parsed.Count} spawn points.",
        Added = parsed.Count,
    });
}
```

- [ ] **Step 4: Add required usings at top of file**

```csharp
using Vanalytics.Core.Models;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
```

(Some may already be present — only add missing ones.)

- [ ] **Step 5: Commit**

```bash
git add src/Vanalytics.Api/Services/Sync/ZoneSyncProvider.cs
git commit -m "feat: add spawn point sync from LandSandBoat (Phase 3)"
```

---

## Task 3: API Endpoint for Zone Spawns

**Files:**
- Modify: `src/Vanalytics.Api/Controllers/ZonesController.cs`

- [ ] **Step 1: Add the spawns endpoint**

Add this method to `ZonesController`:

```csharp
[HttpGet("{id:int}/spawns")]
[AllowAnonymous]
public async Task<IActionResult> GetSpawns(int id)
{
    var spawns = await _db.ZoneSpawns
        .Where(s => s.ZoneId == id)
        .ToListAsync();

    if (spawns.Count == 0)
        return Ok(Array.Empty<object>());

    // Build poolId → isMonster lookup
    var poolIds = spawns.Where(s => s.PoolId.HasValue).Select(s => s.PoolId!.Value).Distinct().ToList();
    var npcPools = await _db.NpcPools
        .Where(n => poolIds.Contains(n.PoolId))
        .ToDictionaryAsync(n => n.PoolId, n => n.IsMonster);

    var result = spawns.Select(s => new
    {
        s.PoolId,
        name = s.MobName,
        s.X,
        s.Y,
        s.Z,
        s.Rotation,
        s.MinLevel,
        s.MaxLevel,
        isMonster = s.PoolId.HasValue && npcPools.TryGetValue(s.PoolId.Value, out var m) ? m : true,
    });

    return Ok(result);
}
```

- [ ] **Step 2: Verify the controller has `_db` field**

The controller should already inject `VanalyticsDbContext` as `_db`. Verify this exists. If the field is named differently, match the existing convention.

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Api/Controllers/ZonesController.cs
git commit -m "feat: add GET /api/zones/{id}/spawns endpoint"
```

---

## Task 4: Frontend Type and API Fetch

**Files:**
- Modify: `src/Vanalytics.Web/src/types/api.ts`
- Modify: `src/Vanalytics.Web/src/pages/ZoneBrowserPage.tsx`
- Delete: `src/Vanalytics.Web/src/lib/ffxi-dat/SpawnParser.ts`

- [ ] **Step 1: Add ZoneSpawnDto type**

Add to `src/Vanalytics.Web/src/types/api.ts`:

```typescript
export interface ZoneSpawnDto {
  poolId: number | null
  name: string
  x: number
  y: number
  z: number
  rotation: number
  minLevel: number
  maxLevel: number
  isMonster: boolean
}
```

- [ ] **Step 2: Replace DAT-based spawn loading in ZoneBrowserPage**

In `src/Vanalytics.Web/src/pages/ZoneBrowserPage.tsx`:

Remove the import of `parseSpawnDat` and `SpawnPoint`:
```typescript
// DELETE THIS LINE:
import { parseSpawnDat } from '../lib/ffxi-dat/SpawnParser'
// DELETE THIS LINE:
import type { SpawnPoint } from '../lib/ffxi-dat/SpawnParser'
```

Add the new import:
```typescript
import { api } from '../api/client'
import type { ZoneSpawnDto } from '../types/api'
```

Replace the spawn state declarations:
```typescript
// OLD:
const [spawnPoints, setSpawnPoints] = useState<SpawnPoint[]>([])

// NEW:
const [spawns, setSpawns] = useState<ZoneSpawnDto[]>([])
const [spawnFilter, setSpawnFilter] = useState('')
const [selectedSpawn, setSelectedSpawn] = useState<ZoneSpawnDto | null>(null)
const [showSkybeams, setShowSkybeams] = useState(true)
```

Replace the `handleToggleSpawns` effect (around line 176):
```typescript
useEffect(() => {
  if (!showSpawns || spawns.length > 0 || !selected) return
  api<ZoneSpawnDto[]>(`/api/zones/${selected.id}/spawns`)
    .then(setSpawns)
    .catch(() => {})
}, [showSpawns, spawns.length, selected])
```

Reset spawns when zone changes — add to the zone load callback, near where `setZoneData` is called:
```typescript
setSpawns([])
setSpawnFilter('')
setSelectedSpawn(null)
```

- [ ] **Step 3: Delete SpawnParser.ts**

```bash
rm src/Vanalytics.Web/src/lib/ffxi-dat/SpawnParser.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/Vanalytics.Web/src/types/api.ts src/Vanalytics.Web/src/pages/ZoneBrowserPage.tsx
git add -u src/Vanalytics.Web/src/lib/ffxi-dat/SpawnParser.ts
git commit -m "feat: replace DAT spawn stub with API-driven spawn loading"
```

---

## Task 5: Rewrite SpawnMarkers for API Data

**Files:**
- Modify: `src/Vanalytics.Web/src/components/zone/SpawnMarkers.tsx`
- Modify: `src/Vanalytics.Web/src/components/zone/ThreeZoneViewer.tsx`

- [ ] **Step 1: Rewrite SpawnMarkers**

Replace the entire contents of `src/Vanalytics.Web/src/components/zone/SpawnMarkers.tsx`:

```typescript
import { useRef, useState } from 'react'
import { ThreeEvent } from '@react-three/fiber'
import type { ZoneSpawnDto } from '../../types/api'

interface SpawnMarkersProps {
  spawns: ZoneSpawnDto[]
  visible: boolean
  onHover?: (spawn: ZoneSpawnDto | null, event: ThreeEvent<PointerEvent> | null) => void
  onClick?: (spawn: ZoneSpawnDto) => void
}

export default function SpawnMarkers({ spawns, visible, onHover, onClick }: SpawnMarkersProps) {
  if (!visible || spawns.length === 0) return null

  return (
    <group>
      {spawns.map((spawn, i) => (
        <mesh
          key={i}
          position={[spawn.x, spawn.y, spawn.z]}
          onPointerOver={(e) => { e.stopPropagation(); onHover?.(spawn, e) }}
          onPointerOut={(e) => { e.stopPropagation(); onHover?.(null, null) }}
          onClick={(e) => { e.stopPropagation(); onClick?.(spawn) }}
        >
          <sphereGeometry args={[0.5, 8, 8]} />
          <meshBasicMaterial
            color={spawn.isMonster ? '#ff4444' : '#4488ff'}
            transparent
            opacity={0.7}
          />
        </mesh>
      ))}
    </group>
  )
}
```

- [ ] **Step 2: Update ThreeZoneViewer props**

In `src/Vanalytics.Web/src/components/zone/ThreeZoneViewer.tsx`, update the props interface:

```typescript
// OLD:
import type { SpawnPoint } from '../../lib/ffxi-dat/SpawnParser'

// NEW:
import type { ZoneSpawnDto } from '../../types/api'
```

Update the props interface:
```typescript
interface ThreeZoneViewerProps {
  zoneData: ParsedZone
  fogDensity?: number
  cameraMode?: 'orbit' | 'fly'
  onFlySpeedChange?: (speed: number) => void
  spawns?: ZoneSpawnDto[]
  filteredSpawns?: ZoneSpawnDto[]
  showSpawns?: boolean
  showSkybeams?: boolean
  onSpawnHover?: (spawn: ZoneSpawnDto | null, event: any) => void
  onSpawnClick?: (spawn: ZoneSpawnDto) => void
}
```

Update the SpawnMarkers usage inside the rendered group (where `<SpawnMarkers>` is currently rendered):

```tsx
<SpawnMarkers
  spawns={spawns ?? []}
  visible={showSpawns ?? false}
  onHover={onSpawnHover}
  onClick={onSpawnClick}
/>
{showSkybeams && filteredSpawns && filteredSpawns.length > 0 && (
  <SpawnSkybeams spawns={filteredSpawns} />
)}
```

Add the import for SpawnSkybeams (will be created in Task 7):
```typescript
import SpawnSkybeams from './SpawnSkybeams'
```

- [ ] **Step 3: Update ZoneBrowserPage to pass new props**

In `src/Vanalytics.Web/src/pages/ZoneBrowserPage.tsx`, compute filtered spawns and update the ThreeZoneViewer call:

Add above the return statement:
```typescript
const filteredSpawns = spawnFilter
  ? spawns.filter(s => s.name.toLowerCase().includes(spawnFilter.toLowerCase()))
  : spawns
```

Update the ThreeZoneViewer props:
```tsx
<ThreeZoneViewer
  zoneData={zoneData}
  fogDensity={fogDensity}
  onFlySpeedChange={setFlySpeed}
  cameraMode={cameraMode}
  spawns={spawnFilter ? filteredSpawns : spawns}
  filteredSpawns={spawnFilter ? filteredSpawns : undefined}
  showSpawns={showSpawns}
  showSkybeams={showSkybeams && !!spawnFilter}
  onSpawnHover={(spawn) => setHoveredSpawn(spawn)}
  onSpawnClick={(spawn) => setSelectedSpawn(spawn)}
/>
```

Add hover state:
```typescript
const [hoveredSpawn, setHoveredSpawn] = useState<ZoneSpawnDto | null>(null)
```

- [ ] **Step 4: Commit**

```bash
git add src/Vanalytics.Web/src/components/zone/SpawnMarkers.tsx src/Vanalytics.Web/src/components/zone/ThreeZoneViewer.tsx src/Vanalytics.Web/src/pages/ZoneBrowserPage.tsx
git commit -m "feat: rewrite spawn markers for API data with hover/click support"
```

---

## Task 6: Spawn Toolbar and Info Card

**Files:**
- Create: `src/Vanalytics.Web/src/components/zone/SpawnToolbar.tsx`
- Create: `src/Vanalytics.Web/src/components/zone/SpawnInfoCard.tsx`
- Modify: `src/Vanalytics.Web/src/pages/ZoneBrowserPage.tsx`

- [ ] **Step 1: Create SpawnToolbar**

```typescript
// src/Vanalytics.Web/src/components/zone/SpawnToolbar.tsx
import { Search } from 'lucide-react'

interface SpawnToolbarProps {
  filter: string
  onFilterChange: (value: string) => void
  showSkybeams: boolean
  onToggleSkybeams: () => void
  spawnCount: number
  filteredCount: number
}

export default function SpawnToolbar({
  filter, onFilterChange, showSkybeams, onToggleSkybeams, spawnCount, filteredCount
}: SpawnToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700/50 shadow-lg">
      <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      <input
        type="text"
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
        placeholder="Search spawns..."
        className="bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none w-40"
      />
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {filter ? `${filteredCount} / ${spawnCount}` : `${spawnCount} spawns`}
      </span>
      {filter && (
        <button
          onClick={onToggleSkybeams}
          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
            showSkybeams
              ? 'bg-yellow-600/30 text-yellow-300 border border-yellow-600/50'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Beams
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create SpawnInfoCard**

```typescript
// src/Vanalytics.Web/src/components/zone/SpawnInfoCard.tsx
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import type { ZoneSpawnDto } from '../../types/api'

interface SpawnInfoCardProps {
  spawn: ZoneSpawnDto
  onClose: () => void
}

export default function SpawnInfoCard({ spawn, onClose }: SpawnInfoCardProps) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 bg-gray-900/95 backdrop-blur border border-gray-700 rounded-lg p-4 shadow-xl min-w-[280px]" onClick={e => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-100">{spawn.name}</h3>
          <span className={`text-xs ${spawn.isMonster ? 'text-red-400' : 'text-blue-400'}`}>
            {spawn.isMonster ? 'Monster' : 'NPC'}
          </span>
        </div>
        <button onClick={onClose} className="p-0.5 text-gray-500 hover:text-gray-300">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400">
        {spawn.poolId && <div>Pool ID: <span className="text-gray-300">{spawn.poolId}</span></div>}
        {(spawn.minLevel > 0 || spawn.maxLevel > 0) && (
          <div>Level: <span className="text-gray-300">{spawn.minLevel}–{spawn.maxLevel}</span></div>
        )}
        <div className="col-span-2">
          Pos: <span className="font-mono text-gray-300">{spawn.x.toFixed(1)}, {spawn.y.toFixed(1)}, {spawn.z.toFixed(1)}</span>
        </div>
      </div>

      {spawn.poolId && (
        <Link
          to={`/npcs?q=${encodeURIComponent(spawn.name)}`}
          className="mt-3 block text-xs text-blue-400 hover:underline"
        >
          View in NPC Browser &rarr;
        </Link>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Wire toolbar and info card into ZoneBrowserPage**

In `src/Vanalytics.Web/src/pages/ZoneBrowserPage.tsx`, add imports:

```typescript
import SpawnToolbar from '../components/zone/SpawnToolbar'
import SpawnInfoCard from '../components/zone/SpawnInfoCard'
```

Add the SpawnToolbar in the overlay area (near the existing spawns toggle button), shown only when spawns are active:

```tsx
{showSpawns && spawns.length > 0 && (
  <SpawnToolbar
    filter={spawnFilter}
    onFilterChange={setSpawnFilter}
    showSkybeams={showSkybeams}
    onToggleSkybeams={() => setShowSkybeams(s => !s)}
    spawnCount={spawns.length}
    filteredCount={filteredSpawns.length}
  />
)}
```

Add the SpawnInfoCard, rendered when a spawn is selected:

```tsx
{selectedSpawn && (
  <SpawnInfoCard
    spawn={selectedSpawn}
    onClose={() => setSelectedSpawn(null)}
  />
)}
```

Add an Escape key handler and click-outside handler to close the info card:

```typescript
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setSelectedSpawn(null)
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [])
```

Also add an `onClick` on the main viewer container div that clears the selection when clicking outside the info card:

```tsx
onClick={() => setSelectedSpawn(null)}
```

The SpawnInfoCard already uses `e.stopPropagation()` on its click handler (via the `onClick` on its root div) to prevent this from closing it when clicking inside.

Also add a hover tooltip near the canvas area for the hovered spawn name:

```tsx
{hoveredSpawn && (
  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 px-2 py-1 rounded bg-gray-900/90 text-xs text-gray-200 pointer-events-none">
    {hoveredSpawn.name}
    {hoveredSpawn.minLevel > 0 && ` (Lv.${hoveredSpawn.minLevel}–${hoveredSpawn.maxLevel})`}
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/Vanalytics.Web/src/components/zone/SpawnToolbar.tsx src/Vanalytics.Web/src/components/zone/SpawnInfoCard.tsx src/Vanalytics.Web/src/pages/ZoneBrowserPage.tsx
git commit -m "feat: add spawn search toolbar and info card popup"
```

---

## Task 7: Skybeam Highlights

**Files:**
- Create: `src/Vanalytics.Web/src/components/zone/SpawnSkybeams.tsx`

- [ ] **Step 1: Create SpawnSkybeams component**

```typescript
// src/Vanalytics.Web/src/components/zone/SpawnSkybeams.tsx
import { useMemo } from 'react'
import * as THREE from 'three'
import type { ZoneSpawnDto } from '../../types/api'

interface SpawnSkybeamsProps {
  spawns: ZoneSpawnDto[]
}

const BEAM_HEIGHT = 80
const BEAM_RADIUS = 0.3

export default function SpawnSkybeams({ spawns }: SpawnSkybeamsProps) {
  const geometry = useMemo(() => new THREE.CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, BEAM_HEIGHT, 6), [])

  const monsterMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ff4444',
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), [])

  const npcMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#4488ff',
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), [])

  return (
    <group>
      {spawns.map((spawn, i) => (
        <mesh
          key={i}
          position={[spawn.x, spawn.y + BEAM_HEIGHT / 2, spawn.z]}
          geometry={geometry}
          material={spawn.isMonster ? monsterMaterial : npcMaterial}
        />
      ))}
    </group>
  )
}
```

- [ ] **Step 2: Verify the import in ThreeZoneViewer**

The import was already added in Task 5 Step 2:
```typescript
import SpawnSkybeams from './SpawnSkybeams'
```

Verify it's present and the `<SpawnSkybeams>` JSX is rendering inside the rotated group.

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/components/zone/SpawnSkybeams.tsx
git commit -m "feat: add skybeam highlights for filtered spawns"
```

---

## Task 8: Full 3D NPC Model Rendering for Filtered Spawns

**Files:**
- Create: `src/Vanalytics.Web/src/components/zone/SpawnModelRenderer.tsx`
- Modify: `src/Vanalytics.Web/src/components/zone/ThreeZoneViewer.tsx`

This is the most complex frontend task. When the user filters to a specific mob name, matching spawns render as full 3D NPC models instead of spheres.

- [ ] **Step 1: Create SpawnModelRenderer**

This component loads and renders NPC models at spawn positions. It reuses the existing DAT parsing pipeline from the NPC browser.

```typescript
// src/Vanalytics.Web/src/components/zone/SpawnModelRenderer.tsx
import { useState, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ZoneSpawnDto } from '../../types/api'
import type { ParsedMesh, ParsedTexture } from '../../lib/ffxi-dat/types'
import { parseDatFile } from '../../lib/ffxi-dat/DatFile'
import { useFfxiFs } from '../../lib/FfxiFs'

interface SpawnModelRendererProps {
  spawns: ZoneSpawnDto[]
  visible: boolean
  onClick?: (spawn: ZoneSpawnDto) => void
}

interface LoadedModel {
  meshes: THREE.Mesh[]
}

export default function SpawnModelRenderer({ spawns, visible, onClick }: SpawnModelRendererProps) {
  const ffxi = useFfxiFs()
  const [modelCache, setModelCache] = useState<Map<number, LoadedModel>>(new Map())
  const [npcPaths, setNpcPaths] = useState<Record<string, string> | null>(null)

  // Load npc-model-paths.json on mount
  useEffect(() => {
    fetch('/data/npc-model-paths.json')
      .then(r => r.json())
      .then(setNpcPaths)
      .catch(() => {})
  }, [])

  // Load models for unique poolIds in the filtered set
  useEffect(() => {
    if (!visible || !npcPaths || !ffxi.ready) return

    const poolIds = [...new Set(spawns.filter(s => s.poolId).map(s => s.poolId!))]
    const toLoad = poolIds.filter(id => !modelCache.has(id))

    toLoad.forEach(async (poolId) => {
      try {
        // Find DAT path for this pool
        const entry = Object.values(npcPaths).find((v: any) => v.poolId === poolId) as any
        if (!entry?.path) return

        const buffer = await ffxi.readFile(entry.path)
        if (!buffer) return

        const { meshes: parsedMeshes, textures } = parseDatFile(buffer)
        if (parsedMeshes.length === 0) return

        // Build Three.js meshes with textures
        const threeMeshes = buildMeshes(parsedMeshes, textures)

        setModelCache(prev => new Map(prev).set(poolId, { meshes: threeMeshes }))
      } catch {
        // Model loading failed — spawn will remain as a marker
      }
    })
  }, [visible, spawns, npcPaths, ffxi.ready])

  if (!visible) return null

  return (
    <group>
      {spawns.map((spawn, i) => {
        const model = spawn.poolId ? modelCache.get(spawn.poolId) : null
        if (!model) return null // Will be rendered as a marker by SpawnMarkers

        return (
          <group
            key={i}
            position={[spawn.x, spawn.y, spawn.z]}
            rotation={[0, spawn.rotation, 0]}
            onClick={(e) => { e.stopPropagation(); onClick?.(spawn) }}
          >
            {model.meshes.map((mesh, mi) => (
              <primitive key={mi} object={mesh.clone()} />
            ))}
          </group>
        )
      })}
    </group>
  )
}

function buildMeshes(parsedMeshes: ParsedMesh[], textures: ParsedTexture[]): THREE.Mesh[] {
  return parsedMeshes.map(pm => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pm.vertices, 3))
    if (pm.normals) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(pm.normals, 3))
    if (pm.uvs) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(pm.uvs, 2))
    if (pm.indices) geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(pm.indices), 1))

    let material: THREE.Material = new THREE.MeshBasicMaterial({ color: '#888888' })

    // Apply texture if available
    if (pm.textureIndex != null && textures[pm.textureIndex]) {
      const tex = textures[pm.textureIndex]
      const dataTexture = new THREE.DataTexture(
        new Uint8Array(tex.rgba),
        tex.width,
        tex.height,
        THREE.RGBAFormat
      )
      dataTexture.needsUpdate = true
      dataTexture.flipY = true
      material = new THREE.MeshBasicMaterial({ map: dataTexture, transparent: true, side: THREE.DoubleSide })
    }

    return new THREE.Mesh(geometry, material)
  })
}
```

- [ ] **Step 2: Add SpawnModelRenderer to ThreeZoneViewer**

In `src/Vanalytics.Web/src/components/zone/ThreeZoneViewer.tsx`, add the import:

```typescript
import SpawnModelRenderer from './SpawnModelRenderer'
```

Inside the rotated group (near SpawnMarkers and SpawnSkybeams), add:

```tsx
{filteredSpawns && filteredSpawns.length > 0 && (
  <SpawnModelRenderer
    spawns={filteredSpawns}
    visible={showSpawns ?? false}
    onClick={onSpawnClick}
  />
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/Vanalytics.Web/src/components/zone/SpawnModelRenderer.tsx src/Vanalytics.Web/src/components/zone/ThreeZoneViewer.tsx
git commit -m "feat: render full 3D NPC models for filtered spawn results"
```

---

## Task 9: Integration Polish and Cleanup

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/ZoneBrowserPage.tsx`
- Modify: `src/Vanalytics.Web/src/components/zone/SpawnMarkers.tsx`

- [ ] **Step 1: Hide markers for spawns that have 3D models loaded**

When a spawn is in the filtered set and might have a 3D model rendering, the sphere marker should still show as a fallback (SpawnModelRenderer returns null for spawns without loaded models, and SpawnMarkers renders all). This is already the correct behavior — both render, and the model visually replaces the sphere. No change needed if it looks acceptable.

If the sphere shows through the model, add a prop to SpawnMarkers to exclude filtered poolIds:

```typescript
// In SpawnMarkers, add optional excludePoolIds prop:
excludePoolIds?: Set<number>

// In the map, skip excluded:
if (excludePoolIds && spawn.poolId && excludePoolIds.has(spawn.poolId)) return null
```

- [ ] **Step 2: Clean up old spawn-related code**

In `ZoneBrowserPage.tsx`, remove any remaining references to:
- `parseSpawnDat`
- `SpawnPoint` type (from the old SpawnParser)
- The old `npcPath`-based loading logic in the spawns toggle effect

Verify no TypeScript errors remain by checking imports.

- [ ] **Step 3: Remove debug logging from MinimapParser**

Remove the `console.log` lines added during minimap debugging in `ZoneBrowserPage.tsx`:

```typescript
// DELETE these lines:
console.log(`[minimap] loaded ${mapPath}: ${mapBuffer ? mapBuffer.byteLength + ' bytes' : 'null'}`)
console.log(`[minimap] parse result for ${mapPath}:`, tex ? `${tex.width}x${tex.height}` : 'null')
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: clean up old spawn code and debug logging"
```
