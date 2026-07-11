using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.DTOs;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PlayersController(VanalyticsDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetPlayers([FromQuery] string? server)
    {
        var charQuery = db.Characters
            .Include(c => c.Jobs)
            .Where(c => c.IsPublic)
            .AsNoTracking();

        if (!string.IsNullOrEmpty(server))
            charQuery = charQuery.Where(c => c.Server == server);

        var characters = await charQuery.ToListAsync();

        // Fetch achievement scores in a single query for the returned characters,
        // then merge in memory — avoids a cartesian join over the Jobs collection.
        var characterIds = characters.Select(c => c.Id).ToList();
        var scoreMap = await db.CharacterAchievements
            .AsNoTracking()
            .Where(a => characterIds.Contains(a.CharacterId))
            .Select(a => new { a.CharacterId, a.TotalScore })
            .ToDictionaryAsync(a => a.CharacterId, a => a.TotalScore);

        var result = characters.Select(c =>
        {
            var activeJob = c.Jobs.FirstOrDefault(j => j.IsActive);
            return new PlayerListItem
            {
                Name = c.Name,
                Server = c.Server,
                Job = activeJob?.JobId.ToString(),
                Level = activeJob?.Level,
                Race = c.Race?.ToString(),
                Linkshell = c.Linkshell,
                LastSyncedAt = c.LastSyncAt,
                TotalScore = scoreMap.GetValueOrDefault(c.Id, 0),
            };
        }).OrderBy(p => p.Name).ToList();

        return Ok(result);
    }
}
