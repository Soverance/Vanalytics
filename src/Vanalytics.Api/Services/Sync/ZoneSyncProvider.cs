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
