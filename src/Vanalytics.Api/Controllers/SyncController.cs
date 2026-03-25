using System.Security.Claims;
using System.Text.Json;
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

        // Parse race ID (1-8) into Race and Gender enums
        if (request.Race.HasValue)
        {
            (character.Race, character.Gender) = request.Race.Value switch
            {
                1 => (Race.Hume, Gender.Male),
                2 => (Race.Hume, Gender.Female),
                3 => (Race.Elvaan, Gender.Male),
                4 => (Race.Elvaan, Gender.Female),
                5 => (Race.Tarutaru, Gender.Male),
                6 => (Race.Tarutaru, Gender.Female),
                7 => (Race.Mithra, Gender.Female),
                8 => (Race.Galka, Gender.Male),
                _ => (character.Race, character.Gender)
            };
        }

        // Update character metadata
        character.FaceModelId = request.FaceModelId;
        character.SubJob = request.SubJob;
        character.SubJobLevel = request.SubJobLevel;
        character.MasterLevel = request.MasterLevel;
        character.ItemLevel = request.ItemLevel;
        character.Hp = request.Hp;
        character.MaxHp = request.MaxHp;
        character.Mp = request.Mp;
        character.MaxMp = request.MaxMp;
        character.Linkshell = request.Linkshell;
        character.Nation = request.Nation;
        character.MeritsJson = request.Merits is { Count: > 0 }
            ? JsonSerializer.Serialize(request.Merits)
            : null;

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
                IsActive = jobType.ToString().Equals(request.ActiveJob, StringComparison.OrdinalIgnoreCase),
                JP = jobEntry.JP,
                JPSpent = jobEntry.JPSpent,
                CP = jobEntry.CP
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

        // Upsert item model mappings from addon's model table
        if (request.Models.Count > 0 && request.Gear.Count > 0)
        {
            var slotNameToModelIndex = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
            {
                ["Head"] = 2, ["Body"] = 3, ["Hands"] = 4,
                ["Legs"] = 5, ["Feet"] = 6,
                ["Main"] = 7, ["Sub"] = 8, ["Range"] = 9
            };

            var modelLookup = request.Models.ToDictionary(m => m.SlotId, m => m.ModelId);

            foreach (var gearEntry in request.Gear)
            {
                if (gearEntry.ItemId <= 0) continue;
                if (!slotNameToModelIndex.TryGetValue(gearEntry.Slot, out var modelSlotIndex)) continue;
                if (!modelLookup.TryGetValue(modelSlotIndex, out var modelId)) continue;
                if (modelId <= 0) continue;

                var existing = await _db.ItemModelMappings
                    .FirstOrDefaultAsync(m => m.ItemId == gearEntry.ItemId && m.SlotId == modelSlotIndex);

                if (existing != null)
                {
                    existing.ModelId = modelId;
                    existing.Source = ModelMappingSource.Addon;
                    existing.UpdatedAt = DateTimeOffset.UtcNow;
                }
                else
                {
                    _db.ItemModelMappings.Add(new ItemModelMapping
                    {
                        ItemId = gearEntry.ItemId,
                        SlotId = modelSlotIndex,
                        ModelId = modelId,
                        Source = ModelMappingSource.Addon,
                        CreatedAt = DateTimeOffset.UtcNow,
                        UpdatedAt = DateTimeOffset.UtcNow
                    });
                }
            }
        }

        character.LastSyncAt = DateTimeOffset.UtcNow;
        character.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { message = "Sync successful", lastSyncAt = character.LastSyncAt });
    }
}
