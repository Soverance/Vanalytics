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
            isMonster = s.PoolId.HasValue && npcPools.TryGetValue(s.PoolId.Value, out var m) ? m : (bool?)null,
        });

        return Ok(result);
    }

    [HttpGet("{id:int}/nm")]
    [AllowAnonymous]
    public async Task<IActionResult> GetNotoriousMonsters(int id)
    {
        // A spawn point is treated as belonging to an NM (or other special
        // mob) if either:
        //   (a) its mob_groups.spawntype is non-zero — lottery/timed/script/
        //       lights/darks/moon/fog, all of which are characteristic of
        //       NM spawn rules, OR
        //   (b) the mob name appears in fewer than three spawn entries in
        //       this zone — regular PHs spawn many times across a zone,
        //       NMs typically have one or two designated spawn points.
        // Returns DISTINCT names so the addon can build a quick lookup set.
        var nmNames = await _db.ZoneSpawns
            .Where(s => s.ZoneId == id)
            .GroupBy(s => s.MobName)
            .Where(g => g.Any(s => s.SpawnType != 0) || g.Count() <= 2)
            .Select(g => g.Key)
            .OrderBy(name => name)
            .ToListAsync();

        return Ok(nmNames);
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
