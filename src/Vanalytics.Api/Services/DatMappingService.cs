// IMPORTANT: When adding new DAT reference mappings to Vanalytics,
// they must also be included in this export service.
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Vanalytics.Core.DTOs.DatMappings;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

public class DatMappingService
{
    private readonly VanalyticsDbContext _db;
    private readonly IMemoryCache _cache;
    private readonly string _dataDir;
    private const string CacheKey = "DatMappingsResponse";
    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(30);
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private static readonly Dictionary<int, string> RaceNames = new()
    {
        [1] = "Hume Male",
        [2] = "Hume Female",
        [3] = "Elvaan Male",
        [4] = "Elvaan Female",
        [5] = "Tarutaru Male",
        [6] = "Tarutaru Female",
        [7] = "Mithra",
        [8] = "Galka",
    };

    private static readonly Dictionary<int, string> SlotNames = new()
    {
        [2] = "Head",
        [3] = "Body",
        [4] = "Hands",
        [5] = "Legs",
        [6] = "Feet",
        [7] = "Main",
        [8] = "Sub",
        [9] = "Range",
    };

    private static readonly Dictionary<int, string> SkeletonPaths = new()
    {
        [1] = "ROM/27/82.dat",
        [2] = "ROM/32/58.dat",
        [3] = "ROM/37/31.dat",
        [4] = "ROM/42/4.dat",
        [5] = "ROM/46/93.dat",
        [6] = "ROM/46/93.dat",
        [7] = "ROM/51/89.dat",
        [8] = "ROM/56/59.dat",
    };

    public DatMappingService(VanalyticsDbContext db, IMemoryCache cache, IWebHostEnvironment env)
    {
        _db = db;
        _cache = cache;
        _dataDir = Path.Combine(env.ContentRootPath, "Data");
    }

    public async Task<DatMappingsResponse> GetAllMappingsAsync()
    {
        if (_cache.TryGetValue(CacheKey, out DatMappingsResponse? cached) && cached is not null)
            return cached;

        var response = new DatMappingsResponse
        {
            GeneratedAt = DateTimeOffset.UtcNow,
            Equipment = await BuildEquipmentAsync(),
            Npcs = await BuildNpcsAsync(),
            Zones = await BuildZonesAsync(),
            Faces = await BuildFacesAsync(),
            Skeletons = BuildSkeletons(),
            Animations = await BuildAnimationsAsync(),
            DatNames = await BuildDatNamesAsync(),
        };

        _cache.Set(CacheKey, response, CacheDuration);
        return response;
    }

    private async Task<List<EquipmentDatEntry>> BuildEquipmentAsync()
    {
        var modelDatPaths = await LoadJsonAsync<Dictionary<string, Dictionary<string, string>>>("model-dat-paths.json");

        var mappings = await _db.ItemModelMappings
            .Join(_db.GameItems,
                m => m.ItemId,
                i => i.ItemId,
                (m, i) => new { i.Name, i.ItemId, m.SlotId, m.ModelId })
            .ToListAsync();

        var grouped = mappings
            .GroupBy(m => new { m.ItemId, m.Name, m.SlotId, m.ModelId })
            .Select(g =>
            {
                var datPaths = new Dictionary<string, string>();
                foreach (var (raceId, raceName) in RaceNames)
                {
                    var key = $"{raceId}:{g.Key.SlotId}";
                    if (modelDatPaths.TryGetValue(key, out var slotPaths) &&
                        slotPaths.TryGetValue(g.Key.ModelId.ToString(), out var path))
                    {
                        datPaths[raceName] = path;
                    }
                }

                return new EquipmentDatEntry
                {
                    Name = g.Key.Name,
                    ItemId = g.Key.ItemId,
                    Slot = SlotNames.GetValueOrDefault(g.Key.SlotId, $"Slot {g.Key.SlotId}"),
                    ModelId = g.Key.ModelId,
                    DatPaths = datPaths,
                };
            })
            .OrderBy(e => e.Name)
            .ToList();

        return grouped;
    }

    private async Task<List<NpcDatEntry>> BuildNpcsAsync()
    {
        var npcPaths = await LoadJsonAsync<List<NpcPathEntry>>("npc-model-paths.json");

        return npcPaths
            .Select(n => new NpcDatEntry
            {
                Name = n.Name,
                Category = n.Category,
                DatPath = n.Path,
            })
            .OrderBy(n => n.Category)
            .ThenBy(n => n.Name)
            .ToList();
    }

    private async Task<List<ZoneDatEntry>> BuildZonesAsync()
    {
        var zones = await _db.Zones
            .Where(z => z.Name != "")
            .OrderBy(z => z.Name)
            .ToListAsync();

        return zones.Select(z => new ZoneDatEntry
        {
            Id = z.Id,
            Name = z.Name,
            ModelPath = z.ModelPath,
            DialogPath = z.DialogPath,
            NpcPath = z.NpcPath,
            EventPath = z.EventPath,
            MapPaths = string.IsNullOrEmpty(z.MapPaths)
                ? []
                : z.MapPaths.Split(';', StringSplitOptions.RemoveEmptyEntries).ToList(),
        }).ToList();
    }

    private async Task<List<FaceDatEntry>> BuildFacesAsync()
    {
        var faces = await LoadJsonAsync<Dictionary<string, List<FacePathEntry>>>("face-paths.json");

        var result = new List<FaceDatEntry>();
        foreach (var (raceId, entries) in faces)
        {
            var raceName = RaceNames.GetValueOrDefault(int.Parse(raceId), $"Race {raceId}");
            foreach (var entry in entries)
            {
                result.Add(new FaceDatEntry
                {
                    Race = raceName,
                    Name = entry.Name,
                    DatPath = entry.Path,
                });
            }
        }
        return result;
    }

    private List<SkeletonDatEntry> BuildSkeletons()
    {
        return SkeletonPaths.Select(kvp => new SkeletonDatEntry
        {
            Race = RaceNames.GetValueOrDefault(kvp.Key, $"Race {kvp.Key}"),
            DatPath = kvp.Value,
        }).ToList();
    }

    private async Task<List<AnimationDatEntry>> BuildAnimationsAsync()
    {
        var animations = await LoadJsonAsync<Dictionary<string, List<AnimationPathEntry>>>("animation-paths.json");

        var result = new List<AnimationDatEntry>();
        foreach (var (raceId, entries) in animations)
        {
            var raceName = RaceNames.GetValueOrDefault(int.Parse(raceId), $"Race {raceId}");
            foreach (var entry in entries)
            {
                result.Add(new AnimationDatEntry
                {
                    Race = raceName,
                    Category = entry.Category,
                    Name = entry.Name,
                    DatPaths = entry.Paths,
                });
            }
        }
        return result;
    }

    private async Task<Dictionary<string, string>> BuildDatNamesAsync()
    {
        // AltanaViewer-sourced naming overlay for DATs that have no ItemModelMapping
        // binding (LSB is silent). LSB/GameItem names win for DATs that are bound to
        // items; this overlay is consulted only when the canonical lookup misses.
        return await LoadJsonAsync<Dictionary<string, string>>("dat-name-overrides.json");
    }

    private async Task<T> LoadJsonAsync<T>(string filename)
    {
        var path = Path.Combine(_dataDir, filename);
        var json = await File.ReadAllTextAsync(path);
        return JsonSerializer.Deserialize<T>(json, JsonOptions)
            ?? throw new InvalidOperationException($"Failed to deserialize {filename}");
    }

    private record NpcPathEntry(string Name, string Category, string Path);
    private record FacePathEntry(string Name, string Path);
    private record AnimationPathEntry(string Name, string Category, List<string> Paths);
}
