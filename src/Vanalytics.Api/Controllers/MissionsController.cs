using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/sync/missions")]
[Authorize(AuthenticationSchemes = "ApiKey")]
public class MissionsController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly VanalyticsDbContext _db;
    private readonly RateLimiter _rateLimiter;

    public MissionsController(VanalyticsDbContext db, RateLimiter rateLimiter)
    {
        _db = db;
        _rateLimiter = rateLimiter;
    }

    [HttpPost]
    public async Task<IActionResult> SyncMissions([FromBody] MissionsSyncRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded. Max 20 requests per hour." });

        var character = await _db.Characters
            .FirstOrDefaultAsync(c => c.Name == request.CharacterName && c.Server == request.Server);

        if (character is null)
            return NotFound(new { message = "Character not found. Run a full sync first." });

        if (character.UserId != userId)
            return StatusCode(403, new { message = "Character is not owned by this account" });

        var row = await _db.CharacterMissions
            .FirstOrDefaultAsync(m => m.CharacterId == character.Id);

        // Load existing state so we can merge per-line. Missing lines in the
        // request are preserved (packet flavor: 0x00D8 might fire without 0x00D0
        // and we don't want to clobber Sandy missions when only ToAU arrives).
        Dictionary<string, MissionLineState> merged;
        if (row?.MissionsJson is { Length: > 0 })
        {
            merged = JsonSerializer.Deserialize<Dictionary<string, MissionLineState>>(row.MissionsJson, JsonOpts)
                ?? new Dictionary<string, MissionLineState>();
        }
        else
        {
            merged = new Dictionary<string, MissionLineState>();
        }

        AssignIfPresent(merged, "sandoriaMissions", request.SandoriaMissions);
        AssignIfPresent(merged, "bastokMissions", request.BastokMissions);
        AssignIfPresent(merged, "windurstMissions", request.WindurstMissions);
        AssignIfPresent(merged, "zilartMissions", request.ZilartMissions);
        AssignIfPresent(merged, "ahturhganMissions", request.AhturhganMissions);
        AssignIfPresent(merged, "wotgMissions", request.WotgMissions);
        AssignIfPresent(merged, "assaults", request.Assaults);
        AssignIfPresent(merged, "copMissions", request.CopMissions);
        AssignIfPresent(merged, "acpMissions", request.AcpMissions);
        AssignIfPresent(merged, "mkdMissions", request.MkdMissions);
        AssignIfPresent(merged, "asaMissions", request.AsaMissions);
        AssignIfPresent(merged, "soaMissions", request.SoaMissions);
        AssignIfPresent(merged, "rovMissions", request.RovMissions);
        AssignIfPresent(merged, "tvrMissions", request.TvrMissions);

        if (row is null)
        {
            row = new CharacterMissions { CharacterId = character.Id };
            _db.CharacterMissions.Add(row);
        }
        row.MissionsJson = JsonSerializer.Serialize(merged, JsonOpts);
        row.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new { message = "Missions sync successful" });
    }

    private static void AssignIfPresent(Dictionary<string, MissionLineState> dict, string key, MissionLineState? value)
    {
        if (value is null) return;
        // Only overwrite if the incoming state actually has data; an empty
        // MissionLineState (both fields null) shouldn't blank out prior data.
        if (value.Completed is null && value.Current is null) return;
        dict[key] = value;
    }
}
