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
[Route("api/sync/collection")]
[Authorize(AuthenticationSchemes = "ApiKey")]
public class CollectionController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly VanalyticsDbContext _db;
    private readonly RateLimiter _rateLimiter;

    public CollectionController(VanalyticsDbContext db, RateLimiter rateLimiter)
    {
        _db = db;
        _rateLimiter = rateLimiter;
    }

    [HttpPost]
    public async Task<IActionResult> SyncCollection([FromBody] CollectionSyncRequest request)
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

        var row = await _db.CharacterCollection
            .FirstOrDefaultAsync(c => c.CharacterId == character.Id);

        if (row is null)
        {
            row = new CharacterCollection { CharacterId = character.Id };
            _db.CharacterCollection.Add(row);
        }

        // Patch semantics: only overwrite a list if the addon actually sent it.
        if (request.SpellIds is not null)
            row.SpellIdsJson = JsonSerializer.Serialize(request.SpellIds, JsonOpts);

        if (request.KeyItemIds is not null)
            row.KeyItemIdsJson = JsonSerializer.Serialize(request.KeyItemIds, JsonOpts);

        row.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new { message = "Collection sync successful" });
    }
}
