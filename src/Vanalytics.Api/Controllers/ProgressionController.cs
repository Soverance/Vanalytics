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
[Route("api/sync/progression")]
[Authorize(AuthenticationSchemes = "ApiKey")]
public class ProgressionController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly VanalyticsDbContext _db;
    private readonly RateLimiter _rateLimiter;

    public ProgressionController(VanalyticsDbContext db, RateLimiter rateLimiter)
    {
        _db = db;
        _rateLimiter = rateLimiter;
    }

    [HttpPost]
    public async Task<IActionResult> SyncProgression([FromBody] ProgressionSyncRequest request)
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

        var row = await _db.CharacterProgression
            .FirstOrDefaultAsync(p => p.CharacterId == character.Id);

        if (row is null)
        {
            row = new CharacterProgression { CharacterId = character.Id };
            _db.CharacterProgression.Add(row);
        }

        // Patch semantics: only overwrite fields the addon actually sent this
        // sync. The addon caches packet payloads as they arrive, so the first
        // sync after install may carry only some Orders.
        if (request.LimitPoints.HasValue) row.LimitPoints = request.LimitPoints;
        if (request.MeritPointsMax.HasValue) row.MeritPointsMax = request.MeritPointsMax;
        if (request.JobPointsUnlocked.HasValue) row.JobPointsUnlocked = request.JobPointsUnlocked;

        if (request.JobPoints is { Count: > 0 })
            row.JobPointsJson = JsonSerializer.Serialize(request.JobPoints, JsonOpts);

        if (request.Warps is not null)
            row.WarpsJson = JsonSerializer.Serialize(request.Warps, JsonOpts);

        row.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();

        return Ok(new { message = "Progression sync successful" });
    }
}
