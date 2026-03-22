using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/sync")]
[Authorize(AuthenticationSchemes = "ApiKey")]
public class SyncController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private readonly RateLimiter _rateLimiter;

    public SyncController(VanalyticsDbContext db, RateLimiter rateLimiter)
    {
        _db = db;
        _rateLimiter = rateLimiter;
    }

    [HttpPost]
    public async Task<IActionResult> Sync([FromBody] SyncRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        // Rate limit per API key (spec: 20 req/hr per API key)
        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded. Max 20 requests per hour." });

        // Find or create character
        var character = await _db.Characters
            .FirstOrDefaultAsync(c => c.Name == request.CharacterName && c.Server == request.Server);

        if (character is null)
        {
            character = new Character
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Name = request.CharacterName,
                Server = request.Server,
                IsPublic = false,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            _db.Characters.Add(character);

            try
            {
                await _db.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                // Unique constraint race condition — re-read
                _db.Entry(character).State = Microsoft.EntityFrameworkCore.EntityState.Detached;
                character = await _db.Characters
                    .FirstOrDefaultAsync(c => c.Name == request.CharacterName && c.Server == request.Server);
                if (character is null)
                    return StatusCode(500, new { message = "Failed to create character" });
            }
        }

        // Verify ownership
        if (character.UserId != userId)
            return StatusCode(403, new { message = "Character is not owned by this account" });

        // Full state replacement
        await _db.CharacterJobs.Where(j => j.CharacterId == character.Id).ExecuteDeleteAsync();
        await _db.EquippedGear.Where(g => g.CharacterId == character.Id).ExecuteDeleteAsync();
        await _db.CraftingSkills.Where(s => s.CharacterId == character.Id).ExecuteDeleteAsync();

        // Re-add jobs directly via the DbSet (avoids navigation-property tracking issues)
        var newJobs = new List<CharacterJob>();
        foreach (var jobEntry in request.Jobs)
        {
            if (!Enum.TryParse<JobType>(jobEntry.Job, true, out var jobType)) continue;

            newJobs.Add(new CharacterJob
            {
                Id = Guid.NewGuid(),
                CharacterId = character.Id,
                JobId = jobType,
                Level = jobEntry.Level,
                IsActive = jobEntry.Job.Equals(request.ActiveJob, StringComparison.OrdinalIgnoreCase)
            });
        }
        _db.CharacterJobs.AddRange(newJobs);

        // Re-add gear
        var newGear = new List<EquippedGear>();
        foreach (var gearEntry in request.Gear)
        {
            if (!Enum.TryParse<EquipSlot>(gearEntry.Slot, true, out var slot)) continue;

            newGear.Add(new EquippedGear
            {
                Id = Guid.NewGuid(),
                CharacterId = character.Id,
                Slot = slot,
                ItemId = gearEntry.ItemId,
                ItemName = gearEntry.ItemName
            });
        }
        _db.EquippedGear.AddRange(newGear);

        // Re-add crafting skills
        var newCrafting = new List<CraftingSkill>();
        foreach (var craftEntry in request.Crafting)
        {
            if (!Enum.TryParse<CraftType>(craftEntry.Craft, true, out var craft)) continue;

            newCrafting.Add(new CraftingSkill
            {
                Id = Guid.NewGuid(),
                CharacterId = character.Id,
                Craft = craft,
                Level = craftEntry.Level,
                Rank = craftEntry.Rank
            });
        }
        _db.CraftingSkills.AddRange(newCrafting);

        character.LastSyncAt = DateTimeOffset.UtcNow;
        character.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { message = "Sync successful", lastSyncAt = character.LastSyncAt });
    }
}
