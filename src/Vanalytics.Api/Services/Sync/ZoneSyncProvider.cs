using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Services.Sync;

public class ZoneSyncProvider : ISyncProvider
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<ZoneSyncProvider> _logger;

    private const string ZoneSettingsUrl =
        "https://raw.githubusercontent.com/LandSandBoat/server/base/sql/zone_settings.sql";

    private const string LsbMobGroupsUrl =
        "https://raw.githubusercontent.com/LandSandBoat/server/base/sql/mob_groups.sql";

    private const string LsbMobSpawnPointsUrl =
        "https://raw.githubusercontent.com/LandSandBoat/server/base/sql/mob_spawn_points.sql";

    public string ProviderId => "zones";
    public string DisplayName => "Zone Data";

    public ZoneSyncProvider(
        IServiceScopeFactory scopeFactory,
        IHttpClientFactory httpClientFactory,
        IWebHostEnvironment env,
        ILogger<ZoneSyncProvider> logger)
    {
        _scopeFactory = scopeFactory;
        _httpClientFactory = httpClientFactory;
        _env = env;
        _logger = logger;
    }

    public async Task SyncAsync(IProgress<SyncProgressEvent> progress, CancellationToken ct)
    {
        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Started,
            Message = "[Phase 1/2 — CSV Import] Loading zone seed data..."
        });

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        // Phase 1: CSV Import
        var (added, updated, skipped) = await RunCsvImportAsync(db, progress, ct);

        // Phase 2: LandSandBoat Enrichment
        await RunLsbEnrichmentAsync(db, progress, ct);

        // Phase 3: Spawn Data Sync
        await RunSpawnSyncAsync(progress, ct);

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Completed,
            Message = $"Sync complete: {added} added, {updated} updated, {skipped} unchanged.",
            Added = added,
            Updated = updated,
            Skipped = skipped
        });
    }

    // -------------------------------------------------------------------------
    // Phase 1: CSV Import
    // -------------------------------------------------------------------------

    private async Task<(int added, int updated, int skipped)> RunCsvImportAsync(
        VanalyticsDbContext db,
        IProgress<SyncProgressEvent> progress,
        CancellationToken ct)
    {
        var csvPath = ResolveCsvPath();
        if (csvPath is null)
        {
            _logger.LogWarning("zone-seed-data.csv not found — skipping CSV import");
            progress.Report(new SyncProgressEvent
            {
                ProviderId = ProviderId,
                Type = SyncEventType.Progress,
                Message = "[Phase 1/2 — CSV Import] CSV file not found — skipped."
            });
            return (0, 0, 0);
        }

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = $"[Phase 1/2 — CSV Import] Reading {Path.GetFileName(csvPath)}..."
        });

        var rows = ParseCsv(csvPath);

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = $"[Phase 1/2 — CSV Import] Parsed {rows.Count} rows. Upserting into database...",
            Total = rows.Count
        });

        // Load existing seed zones (IsDiscovered == false) keyed by Id
        var existing = await db.Zones
            .Where(z => !z.IsDiscovered)
            .ToDictionaryAsync(z => z.Id, z => z, ct);

        var now = DateTimeOffset.UtcNow;
        int added = 0, updated = 0, skipped = 0;

        foreach (var row in rows)
        {
            ct.ThrowIfCancellationRequested();

            if (!int.TryParse(row.GetValueOrDefault("ID"), out var id)) continue;
            var name = row.GetValueOrDefault("NAME") ?? string.Empty;
            var modelPath = row.GetValueOrDefault("MODEL");
            var dialogPath = row.GetValueOrDefault("DIALOG");
            var npcPath = row.GetValueOrDefault("NPCs");
            var eventPath = row.GetValueOrDefault("EVENTS");
            var mapPaths = row.GetValueOrDefault("MAP_PATHS");
            var expansion = DeriveExpansion(modelPath);

            if (existing.TryGetValue(id, out var zone))
            {
                // Detected as changed if any field differs
                if (zone.Name == name &&
                    zone.ModelPath == modelPath &&
                    zone.DialogPath == dialogPath &&
                    zone.NpcPath == npcPath &&
                    zone.EventPath == eventPath &&
                    zone.MapPaths == mapPaths &&
                    zone.Expansion == expansion)
                {
                    // Flip IsDiscovered back to false in case it was changed by re-sync
                    skipped++;
                    continue;
                }

                zone.Name = name;
                zone.ModelPath = modelPath;
                zone.DialogPath = dialogPath;
                zone.NpcPath = npcPath;
                zone.EventPath = eventPath;
                zone.MapPaths = mapPaths;
                zone.Expansion = expansion;
                zone.IsDiscovered = false;
                zone.UpdatedAt = now;
                updated++;
            }
            else
            {
                db.Zones.Add(new Zone
                {
                    Id = id,
                    Name = name,
                    ModelPath = modelPath,
                    DialogPath = dialogPath,
                    NpcPath = npcPath,
                    EventPath = eventPath,
                    MapPaths = mapPaths,
                    Expansion = expansion,
                    IsDiscovered = false,
                    CreatedAt = now,
                    UpdatedAt = now,
                });
                added++;
            }
        }

        await db.SaveChangesAsync(ct);

        _logger.LogInformation("Zone CSV import: {Added} added, {Updated} updated, {Skipped} unchanged",
            added, updated, skipped);

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = $"[Phase 1/2 — CSV Import] {added} added, {updated} updated, {skipped} unchanged.",
            Total = rows.Count,
            Current = rows.Count,
            Added = added,
            Updated = updated,
            Skipped = skipped
        });

        return (added, updated, skipped);
    }

    // -------------------------------------------------------------------------
    // Phase 2: LandSandBoat Enrichment
    // -------------------------------------------------------------------------

    private async Task RunLsbEnrichmentAsync(
        VanalyticsDbContext db,
        IProgress<SyncProgressEvent> progress,
        CancellationToken ct)
    {
        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = "[Phase 2/2 — LSB Enrichment] Downloading zone_settings.sql from LandSandBoat..."
        });

        string sql;
        try
        {
            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(60);
            sql = await client.GetStringAsync(ZoneSettingsUrl, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to download zone_settings.sql — skipping LSB enrichment");
            progress.Report(new SyncProgressEvent
            {
                ProviderId = ProviderId,
                Type = SyncEventType.Progress,
                Message = "[Phase 2/2 — LSB Enrichment] Download failed — skipped."
            });
            return;
        }

        // Parse INSERT rows: (zoneId, name, ...) — zone_settings schema starts with (zoneid,'name',...)
        // Full pattern: (zoneid,'name',ip,port,pos_x,pos_y,pos_z,region,type,battlesolo,battlemulti,...)
        var regex = new Regex(@"\((\d+),'([^']*)',[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,(\d+),");
        var lsbZones = new Dictionary<int, (string Name, int Region)>();

        foreach (Match m in regex.Matches(sql))
        {
            var zoneId = int.Parse(m.Groups[1].Value);
            var name = m.Groups[2].Value;
            var regionId = int.Parse(m.Groups[3].Value);
            lsbZones[zoneId] = (name, regionId);
        }

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = $"[Phase 2/2 — LSB Enrichment] Parsed {lsbZones.Count} zone entries. Enriching database..."
        });

        var regionMap = BuildRegionMap();
        var now = DateTimeOffset.UtcNow;
        int enriched = 0;

        // Load all seed zones (non-discovered) for enrichment
        var zones = await db.Zones
            .Where(z => !z.IsDiscovered)
            .ToListAsync(ct);

        foreach (var zone in zones)
        {
            ct.ThrowIfCancellationRequested();

            if (!lsbZones.TryGetValue(zone.Id, out var lsb)) continue;

            var regionName = regionMap.TryGetValue(lsb.Region, out var rn) ? rn : null;
            var needsUpdate = false;

            // Fill name if blank
            if (string.IsNullOrEmpty(zone.Name) && !string.IsNullOrEmpty(lsb.Name))
            {
                zone.Name = lsb.Name;
                needsUpdate = true;
            }

            // Fill region if missing
            if (zone.Region != regionName && regionName != null)
            {
                zone.Region = regionName;
                needsUpdate = true;
            }

            if (needsUpdate)
            {
                zone.UpdatedAt = now;
                enriched++;
            }
        }

        await db.SaveChangesAsync(ct);

        _logger.LogInformation("LSB enrichment: {Count} zones enriched", enriched);

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = $"[Phase 2/2 — LSB Enrichment] {enriched} zones enriched with names and regions."
        });
    }

    // -------------------------------------------------------------------------
    // Phase 3: Spawn Data Sync
    // -------------------------------------------------------------------------

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
        var spawnRegex = new Regex(@"\((\d+),(\d+),'([^']*)','([^']*)',(\d+),(\d+),(\d+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(\d+)\)");
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
                Rotation = posRot * (MathF.PI / 128f),
                MinLevel = minLevel,
                MaxLevel = maxLevel,
            });
        }

        // Filter to valid zones
        var validZoneIds = await db.Zones.Select(z => z.Id).ToListAsync(ct);
        var validSet = new HashSet<int>(validZoneIds);
        parsed = parsed.Where(s => validSet.Contains(s.ZoneId)).ToList();

        // Full replace strategy
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

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private string? ResolveCsvPath()
    {
        // Try wwwroot/data first (production embedded path)
        if (!string.IsNullOrEmpty(_env.WebRootPath))
        {
            var path1 = Path.Combine(_env.WebRootPath, "data", "zone-seed-data.csv");
            if (File.Exists(path1)) return path1;
        }

        // Try sibling Vanalytics.Web project in dev
        var path2 = Path.Combine(_env.ContentRootPath, "..", "Vanalytics.Web", "public", "data", "zone-seed-data.csv");
        if (File.Exists(path2)) return path2;

        return null;
    }

    private static List<Dictionary<string, string?>> ParseCsv(string filePath)
    {
        var rows = new List<Dictionary<string, string?>>();
        using var reader = new StreamReader(filePath);

        var headerLine = reader.ReadLine();
        if (headerLine is null) return rows;

        var headers = SplitCsvLine(headerLine);

        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            var fields = SplitCsvLine(line);
            var row = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
            for (var i = 0; i < headers.Count; i++)
                row[headers[i]] = i < fields.Count ? fields[i] : null;
            rows.Add(row);
        }

        return rows;
    }

    private static List<string> SplitCsvLine(string line)
    {
        var fields = new List<string>();
        var i = 0;
        while (i <= line.Length)
        {
            if (i == line.Length)
            {
                fields.Add(string.Empty);
                break;
            }

            if (line[i] == '"')
            {
                // Quoted field
                i++; // skip opening quote
                var sb = new System.Text.StringBuilder();
                while (i < line.Length)
                {
                    if (line[i] == '"')
                    {
                        i++;
                        if (i < line.Length && line[i] == '"')
                        {
                            // Escaped quote
                            sb.Append('"');
                            i++;
                        }
                        else
                        {
                            break; // end of quoted field
                        }
                    }
                    else
                    {
                        sb.Append(line[i]);
                        i++;
                    }
                }
                fields.Add(sb.ToString());
                // Expect comma or end
                if (i < line.Length && line[i] == ',') i++;
            }
            else
            {
                // Unquoted field
                var start = i;
                while (i < line.Length && line[i] != ',') i++;
                fields.Add(line[start..i]);
                if (i < line.Length) i++; // skip comma
                else break;
            }
        }
        return fields;
    }

    /// <summary>
    /// Derive expansion name from the ROM volume prefix of a DAT path.
    /// e.g. "ROM/0/120.DAT" → "Original", "ROM2/4/..." → "Rise of the Zilart"
    /// ROM/ paths with a folder number >= 200 return null (let LSB fill it in).
    /// </summary>
    private static string? DeriveExpansion(string? modelPath)
    {
        if (string.IsNullOrEmpty(modelPath)) return null;

        // Extract ROM prefix and first folder number
        var match = Regex.Match(modelPath, @"^(ROM\d*)\/(\d+)\/", RegexOptions.IgnoreCase);
        if (!match.Success) return null;

        var prefix = match.Groups[1].Value.ToUpperInvariant();
        var folder = int.Parse(match.Groups[2].Value);

        return prefix switch
        {
            "ROM" when folder >= 200 => null,
            "ROM" => "Original",
            "ROM2" => "Rise of the Zilart",
            "ROM3" => "Chains of Promathia",
            "ROM4" => "Treasures of Aht Urhgan",
            "ROM5" => "Wings of the Goddess",
            "ROM9" => "Seekers of Adoulin",
            _ => null
        };
    }

    /// <summary>
    /// Maps LandSandBoat region IDs to human-readable region names.
    /// </summary>
    private static Dictionary<int, string> BuildRegionMap() => new()
    {
        [0]  = "Ronfaure",
        [1]  = "Gustaberg",
        [2]  = "Sarutabaruta",
        [3]  = "Kolshushu",
        [4]  = "Aragoneu",
        [5]  = "Derfland",
        [6]  = "Zulkheim",
        [7]  = "Qufim",
        [8]  = "Kuzotz",
        [9]  = "Li'Telor",
        [10] = "Valdeaunia",
        [11] = "Norvallen",
        [12] = "Fauregandi",
        [13] = "Tavnazian Archipelago",
        [14] = "Vollbow",
        [15] = "Grauberg",
        [16] = "Jeuno",
        [17] = "Aht Urhgan",
        [18] = "Ruhotz",
        [19] = "Olzhirya",
        [20] = "Al Zahbi",
        [21] = "Arrapago",
        [22] = "Savaiid",
        [23] = "Ulbuka",
        [24] = "Adoulin",
        [25] = "Escha",
        [26] = "Reives",
        [27] = "Lua",
    };
}
