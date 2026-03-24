# Zone Sync & Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static 48-zone JSON with a server-persisted zone catalog (~290 zones), add minimap overlays and spawn markers to the zone viewer, and build a client-side VTABLE/FTABLE scanner for zone discovery.

**Architecture:** Server-side sync provider imports seed CSV + LandSandBoat data into a Zone table exposed via REST API. Client-side parsers read minimap textures and spawn positions on-the-fly from DAT paths stored in the Zone table. A client-side scanner discovers additional zone DATs via VTABLE/FTABLE probing.

**Tech Stack:** .NET 8 / EF Core (server), React / TypeScript / React Three Fiber (client), File System Access API (DAT reading)

**Spec:** `docs/superpowers/specs/2026-03-23-zone-sync-enrichment-design.md`

---

## File Structure

### New Server-Side Files
| File | Responsibility |
|------|---------------|
| `src/Vanalytics.Core/Models/Zone.cs` | Zone entity model |
| `src/Vanalytics.Data/Configurations/ZoneConfiguration.cs` | EF Core fluent config |
| `src/Vanalytics.Api/Controllers/ZonesController.cs` | Public GET + admin discovered POST |
| `src/Vanalytics.Api/Services/Sync/ZoneSyncProvider.cs` | CSV import + LandSandBoat enrichment |

### New Client-Side Files
| File | Responsibility |
|------|---------------|
| `src/Vanalytics.Web/public/data/zone-seed-data.csv` | Enriched seed CSV (moved from root) |
| `src/Vanalytics.Web/src/lib/ffxi-dat/MinimapParser.ts` | 0xB1 menumap texture parser |
| `src/Vanalytics.Web/src/lib/ffxi-dat/ZoneScanner.ts` | VTABLE/FTABLE zone discovery |
| `src/Vanalytics.Web/src/lib/ffxi-dat/SpawnParser.ts` | NPC DAT spawn position extractor |
| `src/Vanalytics.Web/src/components/zone/MinimapOverlay.tsx` | Minimap corner overlay with floor selector |
| `src/Vanalytics.Web/src/components/zone/SpawnMarkers.tsx` | Three.js spawn marker billboards |
| `src/Vanalytics.Web/scripts/build-zone-seed-csv.mjs` | One-time script to enrich CSV with map paths |

### Modified Files
| File | Changes |
|------|---------|
| `src/Vanalytics.Data/VanalyticsDbContext.cs` | Add `DbSet<Zone> Zones` |
| `src/Vanalytics.Api/Program.cs` | Register ZoneSyncProvider keyed singleton |
| `src/Vanalytics.Api/Controllers/AdminSyncController.cs` | Add "zones" to ProviderIds array |
| `src/Vanalytics.Web/src/pages/ZoneBrowserPage.tsx` | Switch to API, add minimap/spawn integration |
| `src/Vanalytics.Web/src/components/zone/ThreeZoneViewer.tsx` | Accept spawn markers prop |
| `src/Vanalytics.Web/src/lib/ffxi-dat/TextureParser.ts` | Add 0xB1 flag handling |
| `src/Vanalytics.Web/src/pages/AdminItemsPage.tsx` | Add Zone Data sync card + health stats |

**Note:** `SyncContext.tsx` does NOT need modification — it is a generic SSE streaming context that works by provider ID string. Adding `"zones"` to `AdminSyncController.ProviderIds` is sufficient for the sync card to appear.

### Deleted Files
| File | Reason |
|------|--------|
| `src/Vanalytics.Web/public/data/zone-paths.json` | Replaced by API endpoint |
| `src/Vanalytics.Web/scripts/generate-zone-paths.mjs` | No longer needed |

---

### Task 1: Prepare Seed Data CSV

**Files:**
- Move: `ZoneDats.csv` -> `src/Vanalytics.Web/public/data/zone-seed-data.csv`
- Delete: `src/Vanalytics.Web/public/data/zone-paths.json`
- Delete: `src/Vanalytics.Web/scripts/generate-zone-paths.mjs`

This task enriches the CSV with minimap DAT paths from xurion/ffxi-map-dats and moves it to the proper location.

- [ ] **Step 1: Fetch xurion minimap data and build enriched CSV**

Write a Node.js script `scripts/build-zone-seed-csv.mjs` that:
1. Reads the existing `ZoneDats.csv` from the repo root
2. Fetches `https://raw.githubusercontent.com/xurion/ffxi-map-dats/refs/heads/master/ZONES.md`
3. Parses the markdown to extract zone name -> map DAT path(s) mappings
4. Matches zone names between CSV and xurion data (fuzzy match on name, handle variants like "Crawler's Nest" vs "Crawlers' Nest")
5. Adds a `MAP_PATHS` column with semicolon-delimited DAT paths
6. Writes the enriched CSV to `public/data/zone-seed-data.csv`

The output CSV format:
```
ID,NAME,MODEL,DIALOG,NPCs,EVENTS,MAP_PATHS
0,unknown,ROM/1/20.DAT,,,,
1,Phanauet Channel,ROM3/0/0.DAT,ROM3/2/11.DAT,ROM3/2/111.DAT,ROM3/0/67.DAT,ROM/284/2.DAT
100,West Ronfaure,ROM/0/120.DAT,ROM/24/37.DAT,ROM/26/37.DAT,ROM/20/37.DAT,ROM/17/24.DAT
```

For zones with multiple maps (e.g., Delkfutt's Tower):
```
MAP_PATHS
ROM/17/84.DAT;ROM/17/85.DAT;ROM/17/86.DAT;...
```

- [ ] **Step 2: Run the script and verify output**

Run: `cd src/Vanalytics.Web && node scripts/build-zone-seed-csv.mjs`

Verify:
- Output file exists at `public/data/zone-seed-data.csv`
- Has same row count as original CSV (header + ~298 data rows)
- New `MAP_PATHS` column is present
- Spot check: West Ronfaure (ID 100) has `ROM/17/24.DAT` in MAP_PATHS
- Spot check: Delkfutt's Tower zones have multiple semicolon-delimited paths

- [ ] **Step 3: Delete old files**

Delete:
- `src/Vanalytics.Web/public/data/zone-paths.json`
- `src/Vanalytics.Web/scripts/generate-zone-paths.mjs`

The original `ZoneDats.csv` at the repo root can stay as a reference.

- [ ] **Step 4: Commit**

**Checkpoint:** Verify enriched CSV is at `public/data/zone-seed-data.csv`, old files deleted. Ready for commit.

---

### Task 2: Zone Entity Model + Migration

**Files:**
- Create: `src/Vanalytics.Core/Models/Zone.cs`
- Create: `src/Vanalytics.Data/Configurations/ZoneConfiguration.cs`
- Modify: `src/Vanalytics.Data/VanalyticsDbContext.cs`

- [ ] **Step 1: Create Zone entity model**

Create `src/Vanalytics.Core/Models/Zone.cs`:

```csharp
namespace Vanalytics.Core.Models;

public class Zone
{
    public int Id { get; set; }                        // FFXI zone ID, NOT auto-increment
    public string Name { get; set; } = string.Empty;
    public string? ModelPath { get; set; }             // Zone geometry DAT (e.g., "ROM/0/120.DAT")
    public string? DialogPath { get; set; }
    public string? NpcPath { get; set; }               // Spawn data DAT
    public string? EventPath { get; set; }
    public string? MapPaths { get; set; }              // Semicolon-delimited minimap DAT paths
    public string? Expansion { get; set; }             // "Original", "Rise of the Zilart", etc.
    public string? Region { get; set; }                // From LandSandBoat zone_settings
    public bool IsDiscovered { get; set; }             // false=seed data, true=scanner-found
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
```

- [ ] **Step 2: Create Zone EF Core configuration**

Create `src/Vanalytics.Data/Configurations/ZoneConfiguration.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Vanalytics.Core.Models;

namespace Vanalytics.Data.Configurations;

public class ZoneConfiguration : IEntityTypeConfiguration<Zone>
{
    public void Configure(EntityTypeBuilder<Zone> builder)
    {
        builder.HasKey(z => z.Id);
        builder.Property(z => z.Id).ValueGeneratedNever();
        builder.HasIndex(z => z.Name);
        builder.HasIndex(z => z.ModelPath);
        builder.HasIndex(z => z.Expansion);
        builder.Property(z => z.Name).HasMaxLength(128).IsRequired();
        builder.Property(z => z.ModelPath).HasMaxLength(128);
        builder.Property(z => z.DialogPath).HasMaxLength(128);
        builder.Property(z => z.NpcPath).HasMaxLength(128);
        builder.Property(z => z.EventPath).HasMaxLength(128);
        builder.Property(z => z.MapPaths).HasMaxLength(2048);
        builder.Property(z => z.Expansion).HasMaxLength(64);
        builder.Property(z => z.Region).HasMaxLength(128);
    }
}
```

- [ ] **Step 3: Add DbSet to VanalyticsDbContext**

In `src/Vanalytics.Data/VanalyticsDbContext.cs`, add alongside the existing DbSets:

```csharp
public DbSet<Zone> Zones => Set<Zone>();
```

Add the using if not already present:
```csharp
using Vanalytics.Core.Models;
```

- [ ] **Step 4: Generate EF Core migration**

Run from the repo root:
```bash
cd src/Vanalytics.Api
dotnet ef migrations add AddZones --project ../Vanalytics.Data
```

Expected: Creates migration file `src/Vanalytics.Data/Migrations/{timestamp}_AddZones.cs` with `CreateTable("Zones", ...)` and indexes.

- [ ] **Step 5: Verify migration applies**

```bash
dotnet ef database update --project ../Vanalytics.Data
```

Expected: Migration applies successfully. Zones table created with columns and indexes.

- [ ] **Step 6: Commit**

**Checkpoint:** Zone entity, configuration, DbSet, and migration created. Ready for commit.

---

### Task 3: Zone API Controller

**Files:**
- Create: `src/Vanalytics.Api/Controllers/ZonesController.cs`

- [ ] **Step 1: Create ZonesController**

Create `src/Vanalytics.Api/Controllers/ZonesController.cs`:

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/zones")]
public class ZonesController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    public ZonesController(VanalyticsDbContext db)
    {
        _db = db;
    }

    /// <summary>
    /// Public endpoint: returns all zones for the zone browser.
    /// </summary>
    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> GetAll()
    {
        var zones = await _db.Zones
            .Where(z => z.Name != "")
            .OrderBy(z => z.Name)
            .Select(z => new
            {
                z.Id,
                z.Name,
                z.ModelPath,
                z.NpcPath,
                z.MapPaths,
                z.Expansion,
                z.Region,
                z.IsDiscovered
            })
            .ToListAsync();

        return Ok(zones);
    }

    /// <summary>
    /// Admin endpoint: accepts scanner-discovered zones.
    /// Idempotent — skips zones whose ModelPath already exists.
    /// Uses absolute route to place under /api/admin/ namespace.
    /// </summary>
    [HttpPost("/api/admin/zones/discovered")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> AddDiscovered([FromBody] DiscoveredZonesRequest request)
    {
        if (request.Zones == null || request.Zones.Count == 0)
            return BadRequest(new { message = "No zones provided" });

        var existingPaths = await _db.Zones
            .Select(z => z.ModelPath)
            .Where(p => p != null)
            .ToListAsync();

        var existingSet = new HashSet<string>(
            existingPaths.Where(p => p != null).Select(p => p!),
            StringComparer.OrdinalIgnoreCase);

        int created = 0, existing = 0;
        // Use negative IDs for discovered zones to avoid collision with FFXI zone IDs
        var minId = await _db.Zones.MinAsync(z => (int?)z.Id) ?? 0;
        var nextId = Math.Min(minId - 1, -1);

        foreach (var zone in request.Zones)
        {
            if (string.IsNullOrWhiteSpace(zone.ModelPath))
                continue;

            if (existingSet.Contains(zone.ModelPath))
            {
                existing++;
                continue;
            }

            _db.Zones.Add(new Core.Models.Zone
            {
                Id = nextId--,
                Name = zone.ModelPath,  // Use path as name until manually updated
                ModelPath = zone.ModelPath,
                IsDiscovered = true,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow,
            });
            existingSet.Add(zone.ModelPath);
            created++;
        }

        if (created > 0)
            await _db.SaveChangesAsync();

        return Ok(new { created, existing });
    }
}

public record DiscoveredZonesRequest
{
    public List<DiscoveredZoneEntry> Zones { get; init; } = new();
}

public record DiscoveredZoneEntry
{
    public string ModelPath { get; init; } = string.Empty;
}
```

- [ ] **Step 2: Verify build**

```bash
cd src/Vanalytics.Api && dotnet build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

**Checkpoint:** ZonesController builds and compiles. Ready for commit.

---

### Task 4: Zone Sync Provider

**Files:**
- Create: `src/Vanalytics.Api/Services/Sync/ZoneSyncProvider.cs`
- Modify: `src/Vanalytics.Api/Program.cs`
- Modify: `src/Vanalytics.Api/Controllers/AdminSyncController.cs`

- [ ] **Step 1: Create ZoneSyncProvider**

Create `src/Vanalytics.Api/Services/Sync/ZoneSyncProvider.cs`:

```csharp
using System.Net.Http;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Services.Sync;

public class ZoneSyncProvider : ISyncProvider
{
    public string ProviderId => "zones";
    public string DisplayName => "Zone Data";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IWebHostEnvironment _env;

    public ZoneSyncProvider(
        IServiceScopeFactory scopeFactory,
        IHttpClientFactory httpClientFactory,
        IWebHostEnvironment env)
    {
        _scopeFactory = scopeFactory;
        _httpClientFactory = httpClientFactory;
        _env = env;
    }

    public async Task SyncAsync(IProgress<SyncProgressEvent> progress, CancellationToken ct)
    {
        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Started,
            Message = "Starting zone data sync..."
        });

        int added = 0, updated = 0, skipped = 0, failed = 0;

        // ── Phase 1: CSV Seed Import ──
        await Phase1_CsvImport(progress, ct, ref added, ref updated, ref skipped, ref failed);

        // ── Phase 2: LandSandBoat Enrichment ──
        await Phase2_LandSandBoatEnrichment(progress, ct, ref added, ref updated, ref skipped, ref failed);

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Completed,
            Message = $"Zone sync complete. Added: {added}, Updated: {updated}, Skipped: {skipped}",
            Added = added,
            Updated = updated,
            Skipped = skipped,
            Failed = failed,
            Total = added + updated + skipped
        });
    }

    private async Task Phase1_CsvImport(
        IProgress<SyncProgressEvent> progress, CancellationToken ct,
        ref int added, ref int updated, ref int skipped, ref int failed)
    {
        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = "[Phase 1/2 \u2014 CSV Import] Reading seed data..."
        });

        // Read CSV — try multiple known locations:
        // 1. wwwroot/data/ (production: Vite copies public/ contents to build output)
        // 2. ../Vanalytics.Web/public/data/ (development: relative to API project)
        var candidates = new[]
        {
            Path.Combine(_env.WebRootPath ?? _env.ContentRootPath, "data", "zone-seed-data.csv"),
            Path.Combine(_env.ContentRootPath, "..", "Vanalytics.Web", "public", "data", "zone-seed-data.csv"),
        };

        string? csvContent = null;
        foreach (var candidate in candidates)
        {
            var resolved = Path.GetFullPath(candidate);
            if (File.Exists(resolved))
            {
                csvContent = await File.ReadAllTextAsync(resolved, ct);
                break;
            }
        }

        if (csvContent == null)
            throw new FileNotFoundException(
                $"Zone seed CSV not found. Searched: {string.Join(", ", candidates)}");

        var zones = ParseCsv(csvContent);
        var total = zones.Count;

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var existingZones = await db.Zones.ToDictionaryAsync(z => z.Id, ct);

        for (int i = 0; i < zones.Count; i++)
        {
            ct.ThrowIfCancellationRequested();
            var z = zones[i];

            // Skip blank rows
            if (string.IsNullOrWhiteSpace(z.Name) && string.IsNullOrWhiteSpace(z.ModelPath))
            {
                skipped++;
                continue;
            }

            var expansion = DeriveExpansion(z.ModelPath);

            if (existingZones.TryGetValue(z.Id, out var existing))
            {
                bool changed = existing.Name != z.Name
                    || existing.ModelPath != z.ModelPath
                    || existing.DialogPath != z.DialogPath
                    || existing.NpcPath != z.NpcPath
                    || existing.EventPath != z.EventPath
                    || existing.MapPaths != z.MapPaths;

                if (changed)
                {
                    existing.Name = z.Name;
                    existing.ModelPath = z.ModelPath;
                    existing.DialogPath = z.DialogPath;
                    existing.NpcPath = z.NpcPath;
                    existing.EventPath = z.EventPath;
                    existing.MapPaths = z.MapPaths;
                    existing.Expansion = expansion ?? existing.Expansion;
                    existing.IsDiscovered = false;  // Re-sync flips discovered to false
                    existing.UpdatedAt = DateTimeOffset.UtcNow;
                    updated++;
                }
                else
                {
                    skipped++;
                }
            }
            else
            {
                db.Zones.Add(new Zone
                {
                    Id = z.Id,
                    Name = z.Name,
                    ModelPath = z.ModelPath,
                    DialogPath = z.DialogPath,
                    NpcPath = z.NpcPath,
                    EventPath = z.EventPath,
                    MapPaths = z.MapPaths,
                    Expansion = expansion,
                    IsDiscovered = false,
                    CreatedAt = DateTimeOffset.UtcNow,
                    UpdatedAt = DateTimeOffset.UtcNow,
                });
                added++;
            }

            if (i % 50 == 0)
            {
                progress.Report(new SyncProgressEvent
                {
                    ProviderId = ProviderId,
                    Type = SyncEventType.Progress,
                    Message = $"[Phase 1/2 \u2014 CSV Import] Processing zone {i + 1}/{total}",
                    Current = i + 1,
                    Total = total,
                    CurrentItem = z.Name,
                    Added = added,
                    Updated = updated,
                    Skipped = skipped,
                });
            }
        }

        await db.SaveChangesAsync(ct);

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = $"[Phase 1/2 \u2014 CSV Import] Complete. Added: {added}, Updated: {updated}, Skipped: {skipped}",
            Current = total,
            Total = total,
            Added = added,
            Updated = updated,
            Skipped = skipped,
        });
    }

    private async Task Phase2_LandSandBoatEnrichment(
        IProgress<SyncProgressEvent> progress, CancellationToken ct,
        ref int added, ref int updated, ref int skipped, ref int failed)
    {
        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = "[Phase 2/2 \u2014 LandSandBoat Enrichment] Downloading zone_settings.sql..."
        });

        var client = _httpClientFactory.CreateClient();
        string sql;
        try
        {
            sql = await client.GetStringAsync(
                "https://raw.githubusercontent.com/LandSandBoat/server/base/sql/zone_settings.sql", ct);
        }
        catch (Exception ex)
        {
            progress.Report(new SyncProgressEvent
            {
                ProviderId = ProviderId,
                Type = SyncEventType.Progress,
                Message = $"[Phase 2/2 \u2014 LandSandBoat Enrichment] Failed to download: {ex.Message}. Skipping enrichment."
            });
            return;
        }

        // Parse INSERT statements from zone_settings.sql
        // Columns vary by LSB version but typically: zoneid, name, zoneip, zoneport, zonetype, ...
        // We extract zoneid and name. For region, we parse zone_weather.sql or use a zone-to-region map.
        var insertPattern = new Regex(
            @"INSERT\s+INTO\s+`zone_settings`\s+VALUES\s*\((\d+)\s*,\s*'([^']*)'",
            RegexOptions.IgnoreCase);

        var matches = insertPattern.Matches(sql);
        var zoneData = new Dictionary<int, string>();
        foreach (Match m in matches)
        {
            if (int.TryParse(m.Groups[1].Value, out var zoneId))
            {
                zoneData[zoneId] = m.Groups[2].Value;
            }
        }

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = $"[Phase 2/2 \u2014 LandSandBoat Enrichment] Parsed {zoneData.Count} zones from LandSandBoat"
        });

        // Build zone ID -> region mapping from known FFXI region groupings
        var regionMap = BuildRegionMap();

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var zones = await db.Zones.ToListAsync(ct);
        int enriched = 0;

        foreach (var zone in zones)
        {
            ct.ThrowIfCancellationRequested();
            bool changed = false;

            // Fill missing name from LSB
            if (zoneData.TryGetValue(zone.Id, out var lsbName))
            {
                if (string.IsNullOrWhiteSpace(zone.Name) && !string.IsNullOrWhiteSpace(lsbName))
                {
                    zone.Name = lsbName;
                    changed = true;
                }
            }

            // Fill region from known mapping
            if (string.IsNullOrWhiteSpace(zone.Region) && regionMap.TryGetValue(zone.Id, out var region))
            {
                zone.Region = region;
                changed = true;
            }

            if (changed)
            {
                zone.UpdatedAt = DateTimeOffset.UtcNow;
                enriched++;
                updated++;
            }
        }

        if (enriched > 0)
            await db.SaveChangesAsync(ct);

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = $"[Phase 2/2 \u2014 LandSandBoat Enrichment] Complete. Enriched {enriched} zones.",
            Added = added,
            Updated = updated,
            Skipped = skipped,
        });
    }

    private static List<CsvZoneRow> ParseCsv(string csvContent)
    {
        var rows = new List<CsvZoneRow>();
        var lines = csvContent.Split('\n');

        // Skip header
        for (int i = 1; i < lines.Length; i++)
        {
            var line = lines[i].Trim();
            if (string.IsNullOrWhiteSpace(line)) continue;

            // CSV with possible quoted fields
            var parts = SplitCsvLine(line);
            if (parts.Length < 6) continue;

            if (!int.TryParse(parts[0], out var id)) continue;

            rows.Add(new CsvZoneRow
            {
                Id = id,
                Name = parts[1].Trim(),
                ModelPath = parts[2].Trim(),
                DialogPath = parts[3].Trim(),
                NpcPath = parts[4].Trim(),
                EventPath = parts[5].Trim(),
                MapPaths = parts.Length > 6 ? parts[6].Trim() : null,
            });
        }

        return rows;
    }

    private static string[] SplitCsvLine(string line)
    {
        // Simple CSV split handling quoted fields
        var parts = new List<string>();
        bool inQuotes = false;
        var current = new System.Text.StringBuilder();

        foreach (char c in line)
        {
            if (c == '"')
            {
                inQuotes = !inQuotes;
            }
            else if (c == ',' && !inQuotes)
            {
                parts.Add(current.ToString());
                current.Clear();
            }
            else
            {
                current.Append(c);
            }
        }
        parts.Add(current.ToString());
        return parts.ToArray();
    }

    private static string? DeriveExpansion(string? modelPath)
    {
        if (string.IsNullOrWhiteSpace(modelPath)) return null;

        if (modelPath.StartsWith("ROM9/", StringComparison.OrdinalIgnoreCase))
            return "Seekers of Adoulin";
        if (modelPath.StartsWith("ROM5/", StringComparison.OrdinalIgnoreCase))
            return "Wings of the Goddess";
        if (modelPath.StartsWith("ROM4/", StringComparison.OrdinalIgnoreCase))
            return "Treasures of Aht Urhgan";
        if (modelPath.StartsWith("ROM3/", StringComparison.OrdinalIgnoreCase))
            return "Chains of Promathia";
        if (modelPath.StartsWith("ROM2/", StringComparison.OrdinalIgnoreCase))
            return "Rise of the Zilart";

        // ROM/ with high folder numbers are post-expansion content
        // ROM prefix alone can't determine expansion for these — LSB enrichment fills it in
        if (modelPath.StartsWith("ROM/", StringComparison.OrdinalIgnoreCase))
        {
            // Try to extract folder number
            var parts = modelPath.Split('/');
            if (parts.Length >= 2 && int.TryParse(parts[1], out var folder))
            {
                if (folder >= 200) return null;  // Unknown — let LSB fill it in
            }
            return "Original";
        }

        return null;
    }

    /// <summary>
    /// Known FFXI zone ID -> region mappings.
    /// Source: FFXI zone region groupings (Ronfaure, Gustaberg, Sarutabaruta, etc.)
    /// The implementer should populate this from LandSandBoat's zone_settings or
    /// a hardcoded mapping based on FFXI's known zone-region associations.
    /// </summary>
    private static Dictionary<int, string> BuildRegionMap()
    {
        var map = new Dictionary<int, string>();
        // Ronfaure region
        foreach (var id in new[] { 100, 101, 190, 167, 139 })
            map[id] = "Ronfaure";
        // Gustaberg region
        foreach (var id in new[] { 106, 107, 172, 191 })
            map[id] = "Gustaberg";
        // Sarutabaruta region
        foreach (var id in new[] { 115, 116, 117, 145, 192 })
            map[id] = "Sarutabaruta";
        // Jeuno region
        foreach (var id in new[] { 243, 244, 245, 246 })
            map[id] = "Jeuno";
        // TODO: Expand with complete region mappings from LandSandBoat data.
        // This is a starting set — the implementer should add all regions.
        return map;
    }

    private record CsvZoneRow
    {
        public int Id { get; init; }
        public string Name { get; init; } = "";
        public string? ModelPath { get; init; }
        public string? DialogPath { get; init; }
        public string? NpcPath { get; init; }
        public string? EventPath { get; init; }
        public string? MapPaths { get; init; }
    }
}
```

- [ ] **Step 2: Register provider in Program.cs**

In `src/Vanalytics.Api/Program.cs`, add after the existing provider registrations (line ~75):

```csharp
builder.Services.AddKeyedSingleton<ISyncProvider, ZoneSyncProvider>("zones");
```

- [ ] **Step 3: Add "zones" to AdminSyncController.ProviderIds**

In `src/Vanalytics.Api/Controllers/AdminSyncController.cs`, update line 21:

```csharp
private static readonly string[] ProviderIds = ["items", "icons", "zones"];
```

- [ ] **Step 4: Verify build**

```bash
cd src/Vanalytics.Api && dotnet build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

**Checkpoint:** ZoneSyncProvider builds, registered in Program.cs, added to ProviderIds. Ready for commit.

---

### Task 5: Admin Page — Zone Sync Card + Health Stats

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/AdminItemsPage.tsx`

- [ ] **Step 1: Add zone stats to Game Data Health section**

In `AdminItemsPage.tsx`, find the Game Data Health section (the section that shows StatCards for items, models, NPCs, etc.). Add a zone stats fetch to the existing `useEffect` that loads health data, calling `GET /api/zones` and computing:
- Total zones count
- Zones with models (non-null ModelPath)
- Zones with NPC data (non-null NpcPath)
- Zones with map data (non-null MapPaths)
- Scanner-discovered zones (IsDiscovered === true)

Add a `StatCard` for zones in the grid, following the same pattern as the existing item/model/NPC cards.

- [ ] **Step 2: Verify the sync card appears automatically**

The existing `AdminItemsPage` fetches `GET /api/admin/sync/status` and renders a `SyncCard` for each provider returned. Since we added `"zones"` to the `ProviderIds` array in AdminSyncController, the "Zone Data" sync card should appear automatically.

Start the dev server and navigate to `/admin/data`. Verify:
- "Zone Data" sync card appears alongside "Game Data" and "Item Icons"
- Clicking "Sync Now" triggers the zone sync
- Progress updates stream correctly (Phase 1 CSV Import, Phase 2 LandSandBoat)
- Zone stats appear in Game Data Health after sync completes

- [ ] **Step 3: Commit**

**Checkpoint:** Admin page shows zone stats and sync card. Ready for commit.

---

### Task 6: Zone Browser — Switch to API Data Source

**Files:**
- Modify: `src/Vanalytics.Web/src/pages/ZoneBrowserPage.tsx`

- [ ] **Step 1: Replace static JSON fetch with API call**

In `ZoneBrowserPage.tsx`, find where `zone-paths.json` is fetched (the `useEffect` that loads zone data). Replace:

```typescript
// OLD: fetch('/data/zone-paths.json')
// NEW:
const response = await fetch('/api/zones')
const data = await response.json()
```

Update the zone type to match the API response shape:

```typescript
interface ZoneEntry {
  id: number
  name: string
  modelPath: string | null
  npcPath: string | null
  mapPaths: string | null
  expansion: string | null
  region: string | null
  isDiscovered: boolean
}
```

Update all references from the old `{ name, path, expansion }` shape to the new shape. The key change is `path` -> `modelPath`.

- [ ] **Step 2: Update expansion tabs to be dynamic**

Replace the hardcoded "Original" expansion tab with dynamically built tabs from the zone data:

```typescript
const expansions = useMemo(() => {
  const expSet = new Set(zones.filter(z => z.expansion).map(z => z.expansion!))
  const order = [
    'Original', 'Rise of the Zilart', 'Chains of Promathia',
    'Treasures of Aht Urhgan', 'Wings of the Goddess',
    'Seekers of Adoulin'
  ]
  return order.filter(e => expSet.has(e))
    .concat([...expSet].filter(e => !order.includes(e)).sort())
}, [zones])
```

- [ ] **Step 3: Update zone loading to use modelPath**

In the `loadZone` function, change `ffxi.readFile(zone.path)` to `ffxi.readFile(zone.modelPath)`. Add a null check — zones without a modelPath can't be loaded.

- [ ] **Step 4: Add zone info panel**

When a zone is loaded, show an info badge/panel with:
- Zone name and ID
- Expansion and region (from API data)
- Number of map floors (from mapPaths split)
- Number of spawn points (once loaded)

This should appear near the existing zone info badge in the viewer overlay.

- [ ] **Step 5: Verify zone browser works with API data**

Start the dev server. Navigate to `/zones`. Verify:
- Zone list populates from the API (should have ~290 zones after sync)
- Expansion tabs appear for each expansion
- Filtering and search work
- Selecting and loading a zone still renders correctly
- Zones without a modelPath show as non-loadable
- Zone info panel shows expansion, region, map floor count

- [ ] **Step 6: Commit**

**Checkpoint:** Zone browser loads from API with dynamic expansion tabs. Ready for commit.

---

### Task 7: Minimap Parser — 0xB1 Texture Support

**Files:**
- Create: `src/Vanalytics.Web/src/lib/ffxi-dat/MinimapParser.ts`
- Modify: `src/Vanalytics.Web/src/lib/ffxi-dat/TextureParser.ts`

- [ ] **Step 1: Research 0xB1 texture format**

Read the first few minimap DATs (e.g., ROM/17/24.dat for West Ronfaure) using the existing block chain parser and examine:
- Block types present
- IMGINFO header at 0xB1 flag bytes
- Header layout differences vs 0xA1
- DXT type used (likely DXT1 or DXT3)

Create `MinimapParser.ts` that wraps `TextureParser` with 0xB1-specific header handling:

```typescript
import { DatReader } from './DatReader'
import type { ParsedTexture } from './types'

const DATHEAD_SIZE = 8
const BLOCK_PADDING = 8

/**
 * Parse a minimap DAT file and extract the map texture.
 * Minimap DATs use 0xB1 flag IMGINFO headers ("menumap" format).
 * Returns the parsed texture or null if parsing fails.
 */
export function parseMinimapDat(
  buffer: ArrayBuffer
): ParsedTexture | null {
  const reader = new DatReader(buffer)

  // Walk block chain to find texture blocks (type 0x20)
  let offset = 0
  while (offset < reader.length - DATHEAD_SIZE) {
    reader.seek(offset)
    const name = reader.readString(4)
    const packed = reader.readUint32()
    const type = packed & 0x7F
    const nextUnits = (packed >> 7) & 0x7FFFF
    const blockSize = nextUnits * 16
    if (nextUnits === 0) break

    if (type === 0x20) {
      const dataOffset = offset + DATHEAD_SIZE + BLOCK_PADDING
      const dataLength = blockSize - DATHEAD_SIZE - BLOCK_PADDING
      if (dataLength > 0) {
        const texture = parseMinimapTextureBlock(reader, dataOffset, dataLength)
        if (texture) return texture
      }
    }

    offset += blockSize
  }

  return null
}

/**
 * Parse a 0xB1 menumap texture block.
 * Header layout needs to be determined by examining actual minimap DATs.
 * This is a research task — the initial implementation may need adjustment.
 */
function parseMinimapTextureBlock(
  reader: DatReader,
  dataOffset: number,
  dataLength: number
): ParsedTexture | null {
  reader.seek(dataOffset)

  const flag = reader.readUint8()
  if (flag !== 0xB1) return null  // Not a menumap texture

  // TODO: Parse 0xB1 header — layout to be determined during implementation.
  // Expected to be similar to 0xA1 but with different field positions.
  // Key fields needed: width, height, ddsType ("3TXD" or "1TXD"), pixel data offset.
  //
  // Once header is parsed, use existing decompressDXT1/decompressDXT3 from TextureParser.

  return null
}
```

**Note:** The exact 0xB1 header layout requires research during implementation. The parser skeleton is provided; the implementer should hex-dump a minimap DAT to determine the field layout and complete the implementation.

- [ ] **Step 2: Verify build**

```bash
cd src/Vanalytics.Web && npx tsc --noEmit
```

Expected: Build succeeds (parser returns null for now).

- [ ] **Step 3: Commit**

**Checkpoint:** MinimapParser skeleton compiles. Ready for commit.

---

### Task 8: Minimap Overlay Component

**Files:**
- Create: `src/Vanalytics.Web/src/components/zone/MinimapOverlay.tsx`
- Modify: `src/Vanalytics.Web/src/pages/ZoneBrowserPage.tsx`

- [ ] **Step 1: Create MinimapOverlay component**

Create `src/Vanalytics.Web/src/components/zone/MinimapOverlay.tsx`:

```tsx
import { useState, useEffect, useMemo } from 'react'
import { Map, ChevronDown } from 'lucide-react'
import type { ParsedTexture } from '../../lib/ffxi-dat/types'

interface MinimapOverlayProps {
  textures: ParsedTexture[]  // One per floor/map
  labels?: string[]          // Optional floor labels
}

export default function MinimapOverlay({ textures, labels }: MinimapOverlayProps) {
  const [selectedFloor, setSelectedFloor] = useState(0)
  const [collapsed, setCollapsed] = useState(false)

  const imageUrl = useMemo(() => {
    const tex = textures[selectedFloor]
    if (!tex) return null

    const canvas = document.createElement('canvas')
    canvas.width = tex.width
    canvas.height = tex.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const imageData = ctx.createImageData(tex.width, tex.height)
    imageData.data.set(new Uint8Array(tex.rgba))
    ctx.putImageData(imageData, 0, 0)

    return canvas.toDataURL()
  }, [textures, selectedFloor])

  if (textures.length === 0 || !imageUrl) return null

  return (
    <div className="absolute top-16 right-4 z-30 flex flex-col items-end gap-1">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1 px-2 py-1 bg-gray-900/80 text-white text-xs rounded hover:bg-gray-800/90"
      >
        <Map className="w-3 h-3" />
        Map
      </button>

      {!collapsed && (
        <div className="bg-gray-900/80 rounded-lg overflow-hidden shadow-xl">
          {textures.length > 1 && (
            <div className="px-2 py-1 border-b border-gray-700">
              <select
                value={selectedFloor}
                onChange={(e) => setSelectedFloor(Number(e.target.value))}
                className="bg-transparent text-white text-xs w-full outline-none"
              >
                {textures.map((_, i) => (
                  <option key={i} value={i} className="bg-gray-900">
                    {labels?.[i] ?? `Floor ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          <img
            src={imageUrl}
            alt="Zone minimap"
            className="w-48 h-48 object-contain"
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Integrate into ZoneBrowserPage**

In `ZoneBrowserPage.tsx`, after a zone loads, parse minimap DATs from the zone's `mapPaths` field:

```typescript
import { parseMinimapDat } from '../lib/ffxi-dat/MinimapParser'
import MinimapOverlay from '../components/zone/MinimapOverlay'
import type { ParsedTexture } from '../lib/ffxi-dat/types'

// Add state:
const [minimapTextures, setMinimapTextures] = useState<ParsedTexture[]>([])

// In loadZone, after parsing zone geometry:
const mapTextures: ParsedTexture[] = []
if (zone.mapPaths) {
  const mapDatPaths = zone.mapPaths.split(';').filter(Boolean)
  for (const mapPath of mapDatPaths) {
    try {
      const mapBuffer = await ffxi.readFile(mapPath)
      if (mapBuffer) {
        const tex = parseMinimapDat(mapBuffer)
        if (tex) mapTextures.push(tex)
      }
    } catch { /* skip failed map loads */ }
  }
}
setMinimapTextures(mapTextures)
```

Add the `MinimapOverlay` in the JSX alongside the 3D viewer:

```tsx
{minimapTextures.length > 0 && (
  <MinimapOverlay textures={minimapTextures} />
)}
```

- [ ] **Step 3: Verify build**

```bash
cd src/Vanalytics.Web && npx tsc --noEmit
```

Expected: Build succeeds. Minimap overlay won't show data until the 0xB1 parser is completed (Task 7 research), but the component and integration code are in place.

- [ ] **Step 4: Commit**

**Checkpoint:** MinimapOverlay component compiles, integrated into ZoneBrowserPage. Ready for commit.

---

### Task 9: Zone Scanner — VTABLE/FTABLE Discovery

**Files:**
- Create: `src/Vanalytics.Web/src/lib/ffxi-dat/ZoneScanner.ts`
- Modify: `src/Vanalytics.Web/src/pages/AdminItemsPage.tsx`

- [ ] **Step 1: Create ZoneScanner**

Create `src/Vanalytics.Web/src/lib/ffxi-dat/ZoneScanner.ts`:

```typescript
import { FileTableResolver } from './FileTableResolver'
import { DatReader } from './DatReader'

const DATHEAD_SIZE = 8
const BLOCK_TYPE_MZB = 0x1C
const BLOCK_TYPE_MMB = 0x2E
const MAX_BLOCKS_TO_CHECK = 20
const MIN_FILE_SIZE = 1024  // Skip files under 1KB

export interface ScanResult {
  modelPath: string
}

export interface ScanProgress {
  current: number
  total: number
  found: number
  message: string
}

/**
 * Scans VTABLE/FTABLE to discover zone geometry DATs.
 * Walks the block chain of each resolved file and checks for
 * MZB (0x1C) + MMB (0x2E) block type signatures.
 */
export async function scanForZoneDats(
  readFile: (path: string) => Promise<ArrayBuffer | null>,
  resolver: FileTableResolver,
  onProgress?: (progress: ScanProgress) => void,
  signal?: AbortSignal
): Promise<ScanResult[]> {
  const results: ScanResult[] = []

  // Get all valid file IDs from the resolver
  const fileIds: { id: number; path: string }[] = []
  for (let id = 0; id < 100000; id++) {
    const path = resolver.resolveFileId(id)
    if (path) fileIds.push({ id, path })
  }

  const total = fileIds.length
  onProgress?.({ current: 0, total, found: 0, message: `Scanning ${total} files...` })

  for (let i = 0; i < fileIds.length; i++) {
    if (signal?.aborted) break

    const { path } = fileIds[i]

    if (i % 100 === 0) {
      onProgress?.({
        current: i,
        total,
        found: results.length,
        message: `Checking ${path}...`
      })
    }

    try {
      const buffer = await readFile(path)
      if (!buffer || buffer.byteLength < MIN_FILE_SIZE) continue

      if (hasZoneBlockTypes(buffer)) {
        results.push({ modelPath: path })
      }
    } catch {
      // Skip unreadable files
    }
  }

  onProgress?.({
    current: total,
    total,
    found: results.length,
    message: `Scan complete. Found ${results.length} zone DATs.`
  })

  return results
}

/**
 * Walk the block chain header and check for MZB + MMB block types.
 * Only reads the first MAX_BLOCKS_TO_CHECK blocks.
 */
function hasZoneBlockTypes(buffer: ArrayBuffer): boolean {
  const reader = new DatReader(buffer)
  let hasMzb = false
  let hasMmb = false
  let offset = 0

  for (let i = 0; i < MAX_BLOCKS_TO_CHECK; i++) {
    if (offset + DATHEAD_SIZE > reader.length) break

    reader.seek(offset)
    reader.skip(4)  // block name
    const packed = reader.readUint32()
    const type = packed & 0x7F
    const nextUnits = (packed >> 7) & 0x7FFFF

    if (type === BLOCK_TYPE_MZB) hasMzb = true
    if (type === BLOCK_TYPE_MMB) hasMmb = true

    if (hasMzb && hasMmb) return true
    if (nextUnits === 0) break

    offset += nextUnits * 16
  }

  return false
}
```

- [ ] **Step 2: Add "Scan Local Files" button to admin page**

In `AdminItemsPage.tsx`, add a scanner section below the sync cards. This should:
1. Check if FFXI directory is configured (via `useFfxiFileSystem` context)
2. Show a "Scan Local Files" button (only for admin users)
3. When clicked, run `scanForZoneDats()` with progress display
4. On completion, POST results to `/api/admin/zones/discovered`

```typescript
// In the sync section, after the SyncCard grid:
{user?.role === 'Admin' && (
  <ZoneScannerCard />
)}
```

The `ZoneScannerCard` component:
- Shows "Scan Local Files" button with folder icon
- When scanning: progress bar + current file + found count
- On complete: "Found N new zone DATs. Pushed to server."
- Requires FFXI directory access (prompt if not configured)

- [ ] **Step 3: Verify build**

```bash
cd src/Vanalytics.Web && npx tsc --noEmit
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

**Checkpoint:** ZoneScanner and admin scanner card compile. Ready for commit.

---

### Task 10: Spawn Data Parser

**Files:**
- Create: `src/Vanalytics.Web/src/lib/ffxi-dat/SpawnParser.ts`

- [ ] **Step 1: Research spawn DAT binary format**

Read a known NPC DAT file (e.g., ROM/26/37.dat for West Ronfaure) and examine:
- Block chain structure (block types present)
- Binary layout of spawn entries
- How entity IDs, positions (XYZ), rotations are encoded

Reference sources:
- LandSandBoat `mob_spawn_points.sql` for known spawn positions to cross-reference
- DarkStar/LandSandBoat entity loading code

- [ ] **Step 2: Implement SpawnParser**

Create `src/Vanalytics.Web/src/lib/ffxi-dat/SpawnParser.ts`:

```typescript
import { DatReader } from './DatReader'

export interface SpawnPoint {
  entityId: number
  x: number
  y: number
  z: number
  rotation: number
  groupId?: number
}

/**
 * Parse NPC/enemy spawn data from a zone's NPC DAT file.
 * Binary format determined by research in Step 1.
 *
 * Falls back to empty array if format is unrecognized.
 */
export function parseSpawnDat(buffer: ArrayBuffer): SpawnPoint[] {
  const spawns: SpawnPoint[] = []
  const reader = new DatReader(buffer)

  // TODO: Implement based on binary format research.
  // Expected structure:
  // - Header with entry count
  // - Array of spawn entries, each containing:
  //   - Entity ID (uint16 or uint32)
  //   - Position: X, Y, Z (float32 x 3)
  //   - Rotation (float32 or uint16)
  //   - Group/family ID
  //
  // If format proves too complex, fallback plan is to use
  // LandSandBoat mob_spawn_points.sql as a server-side data source.

  return spawns
}
```

- [ ] **Step 3: Verify build**

```bash
cd src/Vanalytics.Web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

**Checkpoint:** SpawnParser skeleton compiles. Ready for commit.

---

### Task 11: Spawn Markers in Zone Viewer

**Files:**
- Create: `src/Vanalytics.Web/src/components/zone/SpawnMarkers.tsx`
- Modify: `src/Vanalytics.Web/src/components/zone/ThreeZoneViewer.tsx`
- Modify: `src/Vanalytics.Web/src/pages/ZoneBrowserPage.tsx`

- [ ] **Step 1: Create SpawnMarkers component**

Create `src/Vanalytics.Web/src/components/zone/SpawnMarkers.tsx`:

```tsx
import * as THREE from 'three'
import type { SpawnPoint } from '../../lib/ffxi-dat/SpawnParser'

interface SpawnMarkersProps {
  spawns: SpawnPoint[]
  visible: boolean
}

export default function SpawnMarkers({ spawns, visible }: SpawnMarkersProps) {
  if (!visible || spawns.length === 0) return null

  return (
    <group>
      {spawns.map((spawn, i) => (
        <group key={i} position={[spawn.x, spawn.y, spawn.z]}>
          <mesh>
            <sphereGeometry args={[0.5, 8, 8]} />
            <meshBasicMaterial color="#ff4444" transparent opacity={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
```

- [ ] **Step 2: Add spawn markers to ThreeZoneViewer**

In `ThreeZoneViewer.tsx`, add an optional `spawnMarkers` prop:

```typescript
interface ThreeZoneViewerProps {
  zoneData: ParsedZone
  lighting?: 'standard' | 'enhanced'
  cameraMode?: 'orbit' | 'fly'
  spawnMarkers?: SpawnPoint[]
  showSpawns?: boolean
}
```

Render `SpawnMarkers` inside the Y-flip group:

```tsx
<group rotation={[Math.PI, 0, 0]}>
  {/* existing instance meshes */}
  <SpawnMarkers spawns={spawnMarkers ?? []} visible={showSpawns ?? false} />
</group>
```

- [ ] **Step 3: Add spawn toggle to ZoneBrowserPage**

In `ZoneBrowserPage.tsx`:
- Add state: `const [showSpawns, setShowSpawns] = useState(false)`
- Add state: `const [spawnPoints, setSpawnPoints] = useState<SpawnPoint[]>([])`
- Add a toolbar toggle button (alongside camera/lighting toggles)
- When spawns toggled on and not yet loaded, read the zone's NPC DAT and parse:

```typescript
import { parseSpawnDat } from '../lib/ffxi-dat/SpawnParser'

// In toggle handler:
if (!showSpawns && spawnPoints.length === 0 && selectedZone?.npcPath) {
  const npcBuffer = await ffxi.readFile(selectedZone.npcPath)
  if (npcBuffer) {
    setSpawnPoints(parseSpawnDat(npcBuffer))
  }
}
setShowSpawns(!showSpawns)
```

Pass to viewer:
```tsx
<ThreeZoneViewer
  zoneData={zoneData}
  lighting={lighting}
  cameraMode={cameraMode}
  spawnMarkers={spawnPoints}
  showSpawns={showSpawns}
/>
```

- [ ] **Step 4: Verify build**

```bash
cd src/Vanalytics.Web && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

**Checkpoint:** SpawnMarkers component and viewer integration compile. Ready for commit.

---

### Task 12: Cleanup and Integration Testing

**Files:**
- Various — final verification pass

- [ ] **Step 1: Verify full build (API + Web)**

```bash
cd src/Vanalytics.Api && dotnet build
cd ../Vanalytics.Web && npx tsc --noEmit
```

Both should succeed with no errors.

- [ ] **Step 2: End-to-end test — sync flow**

1. Start the API server
2. Navigate to `/admin/data`
3. Click "Sync Now" on the Zone Data card
4. Verify Phase 1 (CSV Import) processes ~290 entries
5. Verify Phase 2 (LandSandBoat Enrichment) downloads and enriches
6. Verify zone stats appear in Game Data Health

- [ ] **Step 3: End-to-end test — zone browser**

1. Navigate to `/zones`
2. Verify zone list shows ~290 zones from API
3. Verify expansion tabs work (Original, RoZ, CoP, ToAU, WotG, SoA)
4. Select West Ronfaure, verify 3D viewer renders correctly
5. Test camera modes (orbit/fly) and lighting toggle
6. Check that spawn toggle button exists (markers won't show until SpawnParser is implemented)

- [ ] **Step 4: End-to-end test — scanner**

1. Navigate to `/admin/data`
2. Configure FFXI directory if needed
3. Click "Scan Local Files"
4. Verify scanner runs and reports progress
5. Verify any discovered zones appear in the zone browser

- [ ] **Step 5: Commit any fixes**

**Checkpoint:** All integration tests pass. Ready for final commit.
