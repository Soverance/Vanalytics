using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.DTOs.Achievements;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/leaderboards")]
public class LeaderboardsController(VanalyticsDbContext db) : ControllerBase
{
    [HttpGet("characters")]
    public async Task<IActionResult> Characters([FromQuery] string? server, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        pageSize = Math.Clamp(pageSize, 1, 100);
        page = Math.Max(page, 1);

        var q = db.CharacterAchievements.AsNoTracking()
            .Where(a => a.Character.IsPublic);
        if (!string.IsNullOrWhiteSpace(server))
            q = q.Where(a => a.Character.Server == server);

        var total = await q.CountAsync();
        var ordered = await q
            .OrderByDescending(a => a.TotalScore)
            .ThenByDescending(a => a.Character.LastSyncAt)
            .ThenBy(a => a.Character.Name)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(a => new { a.CharacterId, a.Character.Name, a.Character.Server, a.TotalScore, a.Character.LastSyncAt, a.Character.Linkshell })
            .ToListAsync();

        var items = ordered.Select((a, idx) => new CharacterLeaderboardEntry(
            (page - 1) * pageSize + idx + 1, a.CharacterId, a.Name, a.Server, a.TotalScore, a.LastSyncAt, a.Linkshell)).ToList();

        return Ok(new LeaderboardPage<CharacterLeaderboardEntry>(items, total, page, pageSize));
    }

    [HttpGet("linkshells")]
    public async Task<IActionResult> Linkshells(
        [FromQuery] string? server,
        [FromQuery] string sort = "total",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        pageSize = Math.Clamp(pageSize, 1, 100);
        page = Math.Max(page, 1);

        var q = db.LinkshellAchievements.AsNoTracking().Where(a => a.RankedMemberCount > 0 && a.Linkshell.IsPublic);
        if (!string.IsNullOrWhiteSpace(server))
            q = q.Where(a => a.Linkshell.Server == server);

        q = sort switch
        {
            "average" => q.OrderByDescending(a => a.AverageScore).ThenByDescending(a => a.TotalScore),
            "members" => q.OrderByDescending(a => a.RankedMemberCount).ThenByDescending(a => a.TotalScore),
            _         => q.OrderByDescending(a => a.TotalScore).ThenByDescending(a => a.AverageScore),
        };

        var total = await q.CountAsync();
        var rows = await q.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(a => new { a.LinkshellId, a.Linkshell.Name, a.Linkshell.Server, a.TotalScore, a.AverageScore, a.RankedMemberCount, a.Linkshell.ColorRgb })
            .ToListAsync();

        var items = rows.Select((a, idx) => new LinkshellLeaderboardEntry(
            (page - 1) * pageSize + idx + 1, a.LinkshellId, a.Name, a.Server, a.TotalScore, a.AverageScore, a.RankedMemberCount, a.ColorRgb)).ToList();

        return Ok(new LeaderboardPage<LinkshellLeaderboardEntry>(items, total, page, pageSize));
    }
}
