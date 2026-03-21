using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/servers")]
public class ServersController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    public ServersController(VanalyticsDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var servers = await _db.GameServers
            .OrderBy(s => s.Name)
            .Select(s => new
            {
                s.Id,
                s.Name,
                Status = s.Status.ToString(),
                s.LastCheckedAt,
            })
            .ToListAsync();

        return Ok(servers);
    }

    [HttpGet("{name}/history")]
    public async Task<IActionResult> History(string name, [FromQuery] int days = 30)
    {
        if (days > 365) days = 365;

        var server = await _db.GameServers
            .FirstOrDefaultAsync(s => s.Name == name);

        if (server is null) return NotFound();

        var since = DateTimeOffset.UtcNow.AddDays(-days);

        var history = await _db.ServerStatusChanges
            .Where(h => h.GameServerId == server.Id && (h.EndedAt == null || h.EndedAt > since))
            .OrderByDescending(h => h.StartedAt)
            .Select(h => new
            {
                Status = h.Status.ToString(),
                h.StartedAt,
                h.EndedAt,
            })
            .ToListAsync();

        // Calculate uptime percentage over the period
        var totalMinutes = (DateTimeOffset.UtcNow - since).TotalMinutes;
        var onlineMinutes = 0.0;

        var allChanges = await _db.ServerStatusChanges
            .Where(h => h.GameServerId == server.Id && (h.EndedAt == null || h.EndedAt > since))
            .ToListAsync();

        foreach (var change in allChanges)
        {
            if (change.Status != Vanalytics.Core.Enums.ServerStatus.Online) continue;

            var start = change.StartedAt < since ? since : change.StartedAt;
            var end = change.EndedAt ?? DateTimeOffset.UtcNow;
            onlineMinutes += (end - start).TotalMinutes;
        }

        var uptimePercent = totalMinutes > 0 ? Math.Round(onlineMinutes / totalMinutes * 100, 2) : 0;

        return Ok(new
        {
            server.Name,
            Status = server.Status.ToString(),
            server.LastCheckedAt,
            Days = days,
            UptimePercent = uptimePercent,
            History = history,
        });
    }
}
