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
