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

    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> GetAll()
    {
        var zones = await _db.Zones
            .Where(z => z.Name != "")
            .OrderBy(z => z.Name)
            .Select(z => new
            {
                z.Id, z.Name, z.ModelPath, z.NpcPath, z.MapPaths,
                z.Expansion, z.Region, z.IsDiscovered
            })
            .ToListAsync();
        return Ok(zones);
    }

    [HttpGet("{id:int}/spawns")]
    [AllowAnonymous]
    public async Task<IActionResult> GetSpawns(int id)
    {
        // Filter out LSB "not yet placed" rows (sentinel coords 1,1,1) — those
        // rows are kept in the table so /nm can use their MobIndex, but they
        // would render at world origin as garbage map pins.
        var spawns = await _db.ZoneSpawns
            .Where(s => s.ZoneId == id && !(s.X == 1.0f && s.Y == 1.0f && s.Z == 1.0f))
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
            isMonster = s.PoolId.HasValue && npcPools.TryGetValue(s.PoolId.Value, out var m) ? m : (bool?)null,
        });

        return Ok(result);
    }

    [HttpGet("{id:int}/nm")]
    [AllowAnonymous]
    public async Task<IActionResult> GetNotoriousMonsters(int id)
    {
        // Returns per-mob metadata for every distinct spawn name in the zone:
        //
        //   { "Cactuar":            { "isNm": false, "respawn": 300, "mobIndices": ["0x157"] },
        //     "Cactuar Cantautor":  { "isNm": true,  "respawn": 3600,
        //                             "mobIndices": ["0x158"],   // low 12 bits of LSB mobid
        //                             "spawnType": "lottery", "genus": "Sabotender",
        //                             "placeholder": { "name": "Cactuar", "mobIndex": "0x157" },
        //                             "notes": "Window opens 1h..." }, ... }
        //
        // The addon uses isNm to choose between notify_NM.wav / notify_Standard.wav,
        // respawn to render a live pop countdown, and mobIndices for Phase 2
        // watch-by-index (Cactuar Cantautor PH at 0x157 / NM pops at 0x158).
        //
        // Curated data (ZoneNamedMonsters) wins when present for the zone — its
        // existence implicitly suppresses the heuristic. For uncurated zones the
        // heuristic falls back to:
        //   (a) any spawns have spawntype with TIMED (2) or SCRIPTED (4) bits set,
        //   (b) any spawns have respawntime >= 600s, or
        //   (c) the name has exactly one spawn entry (singleton ≈ NM/event).
        const int NmSpawntypeMask = 0x6;
        const int NmRespawnThreshold = 600;

        // Materialize int indices in the SQL projection (FormatMobIndex is a
        // C# method EF can't translate), then format hex client-side below.
        var rawGroups = await _db.ZoneSpawns
            .Where(s => s.ZoneId == id)
            .GroupBy(s => s.MobName)
            .Select(g => new
            {
                Name = g.Key,
                Count = g.Count(),
                MaxRespawn = g.Max(s => s.RespawnTime),
                AnyNmSpawntype = g.Any(s => (s.SpawnType & NmSpawntypeMask) != 0),
                MobIndicesRaw = g.Select(s => s.MobIndex)
                                 .Where(i => i > 0)
                                 .Distinct()
                                 .OrderBy(i => i)
                                 .ToList(),
            })
            .ToListAsync();

        var groups = rawGroups.Select(g => new
        {
            g.Name,
            g.Count,
            g.MaxRespawn,
            g.AnyNmSpawntype,
            MobIndices = g.MobIndicesRaw.Select(FormatMobIndex).ToArray(),
        }).ToList();

        var curated = await _db.ZoneNamedMonsters
            .Where(n => n.ZoneId == id)
            .ToDictionaryAsync(n => n.MobName, StringComparer.OrdinalIgnoreCase);

        var result = new Dictionary<string, object>();

        if (curated.Count == 0)
        {
            // Uncurated zone — heuristic path.
            foreach (var g in groups)
            {
                result[g.Name] = new
                {
                    isNm = g.AnyNmSpawntype || g.MaxRespawn >= NmRespawnThreshold || g.Count <= 1,
                    respawn = g.MaxRespawn,
                    mobIndices = g.MobIndices,
                };
            }
            return Ok(result);
        }

        // Curated zone — heuristic is suppressed; only names in the curated file
        // are NMs. Regular spawns still appear with isNm=false so the addon can
        // distinguish them from unknown mobs.
        var seenCurated = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var g in groups)
        {
            if (curated.TryGetValue(g.Name, out var nm))
            {
                seenCurated.Add(g.Name);
                result[g.Name] = BuildCuratedEntry(nm, fallbackRespawn: g.MaxRespawn, mobIndices: g.MobIndices);
            }
            else
            {
                result[g.Name] = new { isNm = false, respawn = g.MaxRespawn, mobIndices = g.MobIndices };
            }
        }

        // Popped / quest NMs (and any other curated rows not in ZoneSpawns)
        foreach (var (name, nm) in curated)
        {
            if (seenCurated.Contains(name)) continue;
            result[name] = BuildCuratedEntry(nm, fallbackRespawn: 0, mobIndices: Array.Empty<string>());
        }

        return Ok(result);
    }

    private static string FormatMobIndex(int index) => $"0x{index:X3}";

    private static object BuildCuratedEntry(
        Core.Models.ZoneNamedMonster nm,
        int fallbackRespawn,
        string[] mobIndices)
    {
        return new
        {
            isNm = true,
            respawn = nm.RespawnTime ?? fallbackRespawn,
            mobIndices,
            spawnType = string.IsNullOrEmpty(nm.SpawnTypeLabel) ? null : nm.SpawnTypeLabel,
            genus = nm.Genus,
            placeholder = nm.PlaceholderName is null && nm.PlaceholderMobIndex is null
                ? null
                : (object)new { name = nm.PlaceholderName, mobIndex = nm.PlaceholderMobIndex },
            notes = nm.Notes,
        };
    }

    [HttpPost("/api/admin/zones/discovered")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> AddDiscovered([FromBody] DiscoveredZonesRequest request)
    {
        if (request.Zones == null || request.Zones.Count == 0)
            return BadRequest(new { message = "No zones provided" });

        var existingPaths = await _db.Zones
            .Select(z => z.ModelPath).Where(p => p != null).ToListAsync();
        var existingSet = new HashSet<string>(
            existingPaths.Where(p => p != null).Select(p => p!),
            StringComparer.OrdinalIgnoreCase);

        int created = 0, existing = 0;
        var minId = await _db.Zones.MinAsync(z => (int?)z.Id) ?? 0;
        var nextId = Math.Min(minId - 1, -1);

        foreach (var zone in request.Zones)
        {
            if (string.IsNullOrWhiteSpace(zone.ModelPath)) continue;
            if (existingSet.Contains(zone.ModelPath)) { existing++; continue; }

            _db.Zones.Add(new Core.Models.Zone
            {
                Id = nextId--,
                Name = zone.ModelPath,
                ModelPath = zone.ModelPath,
                IsDiscovered = true,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow,
            });
            existingSet.Add(zone.ModelPath);
            created++;
        }

        if (created > 0) await _db.SaveChangesAsync();
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
