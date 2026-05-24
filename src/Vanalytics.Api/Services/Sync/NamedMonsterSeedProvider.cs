using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Services.Sync;

/// <summary>
/// Seeds the ZoneNamedMonsters table from curated per-zone JSON files under
/// Vanalytics.Web/public/data/nms/. Per-zone full replace: any rows present
/// for a zone listed in a file are deleted and re-inserted from the file.
/// Files starting with '_' (e.g. _example.json, _retry_candidates.log) are
/// skipped.
/// </summary>
public class NamedMonsterSeedProvider : ISyncProvider
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<NamedMonsterSeedProvider> _logger;

    public string ProviderId => "named-monsters";
    public string DisplayName => "Named Monster Curation";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    public NamedMonsterSeedProvider(
        IServiceScopeFactory scopeFactory,
        IWebHostEnvironment env,
        ILogger<NamedMonsterSeedProvider> logger)
    {
        _scopeFactory = scopeFactory;
        _env = env;
        _logger = logger;
    }

    public async Task SyncAsync(IProgress<SyncProgressEvent> progress, CancellationToken ct)
    {
        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Started,
            Message = "Locating curated NM data..."
        });

        var dataDir = ResolveDataDir();
        if (dataDir is null)
        {
            _logger.LogWarning("NM data directory not found — skipping seed");
            progress.Report(new SyncProgressEvent
            {
                ProviderId = ProviderId,
                Type = SyncEventType.Completed,
                Message = "No NM data directory found — nothing to seed."
            });
            return;
        }

        var files = Directory.EnumerateFiles(dataDir, "*.json")
            .Where(f => !Path.GetFileName(f).StartsWith('_'))
            .OrderBy(f => f, StringComparer.OrdinalIgnoreCase)
            .ToList();

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Progress,
            Message = $"Parsing {files.Count} zone files from {dataDir}...",
            Total = files.Count
        });

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var now = DateTimeOffset.UtcNow;
        int added = 0, updated = 0, skipped = 0, failed = 0, zonesProcessed = 0;

        foreach (var file in files)
        {
            ct.ThrowIfCancellationRequested();

            var fileName = Path.GetFileName(file);
            ZoneNmFile? parsed;
            try
            {
                await using var stream = File.OpenRead(file);
                parsed = await JsonSerializer.DeserializeAsync<ZoneNmFile>(stream, JsonOptions, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to parse {File} — skipping", fileName);
                failed++;
                continue;
            }

            if (parsed is null || parsed.ZoneId <= 0)
            {
                _logger.LogWarning("Skipping {File} — missing or invalid zoneId", fileName);
                failed++;
                continue;
            }

            var (a, u, s) = await UpsertZoneAsync(db, parsed, now, ct);
            added += a;
            updated += u;
            skipped += s;
            zonesProcessed++;

            progress.Report(new SyncProgressEvent
            {
                ProviderId = ProviderId,
                Type = SyncEventType.Progress,
                Message = $"Seeded {parsed.ZoneName ?? "?"} ({parsed.Nms?.Count ?? 0} NMs)",
                CurrentItem = fileName,
                Current = zonesProcessed,
                Total = files.Count,
                Added = added,
                Updated = updated,
                Skipped = skipped,
                Failed = failed,
            });
        }

        _logger.LogInformation(
            "NM seed: {Zones} zones processed, {Added} added, {Updated} updated, {Skipped} unchanged, {Failed} failed",
            zonesProcessed, added, updated, skipped, failed);

        progress.Report(new SyncProgressEvent
        {
            ProviderId = ProviderId,
            Type = SyncEventType.Completed,
            Message = $"NM seed complete: {zonesProcessed} zones, {added} added, {updated} updated, {skipped} unchanged.",
            Total = files.Count,
            Current = zonesProcessed,
            Added = added,
            Updated = updated,
            Skipped = skipped,
            Failed = failed,
        });
    }

    private async Task<(int added, int updated, int skipped)> UpsertZoneAsync(
        VanalyticsDbContext db,
        ZoneNmFile file,
        DateTimeOffset now,
        CancellationToken ct)
    {
        var existing = await db.ZoneNamedMonsters
            .Where(n => n.ZoneId == file.ZoneId)
            .ToDictionaryAsync(n => n.MobName, StringComparer.OrdinalIgnoreCase, ct);

        int added = 0, updated = 0, skipped = 0;
        var seenNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var nm in file.Nms ?? new List<NmEntry>())
        {
            if (string.IsNullOrWhiteSpace(nm.Name)) continue;
            if (!seenNames.Add(nm.Name)) continue;

            var primaryPh = nm.Placeholders?.FirstOrDefault();
            var phName = primaryPh?.Name;
            var phIndex = primaryPh?.MobIndex;
            var spawnType = nm.SpawnType ?? string.Empty;

            if (existing.TryGetValue(nm.Name, out var row))
            {
                if (row.Genus == nm.Genus
                    && row.SpawnTypeLabel == spawnType
                    && row.RespawnTime == nm.RespawnTime
                    && row.PlaceholderName == phName
                    && row.PlaceholderMobIndex == phIndex
                    && row.Notes == nm.Notes)
                {
                    skipped++;
                    continue;
                }

                row.Genus = nm.Genus;
                row.SpawnTypeLabel = spawnType;
                row.RespawnTime = nm.RespawnTime;
                row.PlaceholderName = phName;
                row.PlaceholderMobIndex = phIndex;
                row.Notes = nm.Notes;
                row.UpdatedAt = now;
                updated++;
            }
            else
            {
                db.ZoneNamedMonsters.Add(new ZoneNamedMonster
                {
                    ZoneId = file.ZoneId,
                    MobName = nm.Name,
                    Genus = nm.Genus,
                    SpawnTypeLabel = spawnType,
                    RespawnTime = nm.RespawnTime,
                    PlaceholderName = phName,
                    PlaceholderMobIndex = phIndex,
                    Notes = nm.Notes,
                    UpdatedAt = now,
                });
                added++;
            }
        }

        // Prune rows no longer in the curated file (per-zone full replace)
        var stale = existing.Values.Where(r => !seenNames.Contains(r.MobName)).ToList();
        if (stale.Count > 0)
        {
            db.ZoneNamedMonsters.RemoveRange(stale);
        }

        await db.SaveChangesAsync(ct);
        return (added, updated, skipped);
    }

    private string? ResolveDataDir()
    {
        // Production: published under wwwroot/data/nms
        if (!string.IsNullOrEmpty(_env.WebRootPath))
        {
            var p1 = Path.Combine(_env.WebRootPath, "data", "nms");
            if (Directory.Exists(p1)) return p1;
        }

        // Dev: sibling Vanalytics.Web project
        var p2 = Path.Combine(_env.ContentRootPath, "..", "Vanalytics.Web", "public", "data", "nms");
        if (Directory.Exists(p2)) return Path.GetFullPath(p2);

        return null;
    }

    private sealed record ZoneNmFile
    {
        public int ZoneId { get; init; }
        public string? ZoneName { get; init; }
        public string? WikiUrl { get; init; }
        public List<NmEntry>? Nms { get; init; }
    }

    private sealed record NmEntry
    {
        public string? Name { get; init; }
        public string? Genus { get; init; }
        public string? SpawnType { get; init; }
        public int? RespawnTime { get; init; }
        public List<PlaceholderEntry>? Placeholders { get; init; }
        public string? Notes { get; init; }
    }

    private sealed record PlaceholderEntry
    {
        public string? Name { get; init; }
        public string? MobIndex { get; init; }
    }
}
