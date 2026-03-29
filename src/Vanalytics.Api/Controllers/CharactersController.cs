using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.DTOs.Characters;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/characters")]
[Authorize]
public class CharactersController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    public CharactersController(VanalyticsDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var userId = GetUserId();
        var characters = await _db.Characters
            .Where(c => c.UserId == userId)
            .Select(c => new CharacterSummaryResponse
            {
                Id = c.Id,
                Name = c.Name,
                Server = c.Server,
                IsPublic = c.IsPublic,
                LastSyncAt = c.LastSyncAt
            })
            .ToListAsync();

        return Ok(characters);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var userId = GetUserId();
        var character = await _db.Characters
            .Include(c => c.Jobs)
            .Include(c => c.Gear)
            .Include(c => c.CraftingSkills)
            .FirstOrDefaultAsync(c => c.Id == id);

        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        return Ok(MapToDetail(character));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCharacterRequest request)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);

        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        character.IsPublic = request.IsPublic;
        character.FavoriteAnimationJson = request.FavoriteAnimation != null
            ? JsonSerializer.Serialize(request.FavoriteAnimation, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase })
            : null;
        character.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new CharacterSummaryResponse
        {
            Id = character.Id,
            Name = character.Name,
            Server = character.Server,
            IsPublic = character.IsPublic,
            LastSyncAt = character.LastSyncAt
        });
    }

    [HttpGet("{id:guid}/inventory")]
    public async Task<IActionResult> GetInventory(Guid id)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);

        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        var items = await _db.CharacterInventories
            .Where(i => i.CharacterId == id)
            .Join(_db.GameItems,
                ci => ci.ItemId,
                gi => gi.ItemId,
                (ci, gi) => new
                {
                    ci.ItemId,
                    Bag = ci.Bag.ToString(),
                    ci.SlotIndex,
                    ci.Quantity,
                    ci.LastSeenAt,
                    ItemName = gi.Name ?? gi.NameJa ?? "Unknown",
                    gi.IconPath,
                    gi.Category,
                    gi.StackSize
                })
            .OrderBy(i => i.Bag)
            .ThenBy(i => i.ItemName)
            .ToListAsync();

        var grouped = items
            .GroupBy(i => i.Bag)
            .ToDictionary(g => g.Key, g => g.ToList());

        return Ok(grouped);
    }

    [HttpGet("{id:guid}/relics")]
    public async Task<IActionResult> GetRelics(Guid id)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);

        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        // Collect all item IDs this character has ever held
        var currentItemIds = await _db.CharacterInventories
            .Where(i => i.CharacterId == id)
            .Select(i => i.ItemId)
            .Distinct()
            .ToListAsync();

        var historicalItemIds = await _db.InventoryChanges
            .Where(c => c.CharacterId == id && c.ChangeType == Vanalytics.Core.Enums.InventoryChangeType.Added)
            .Select(c => c.ItemId)
            .Distinct()
            .ToListAsync();

        var everHeldIds = currentItemIds.Union(historicalItemIds).ToHashSet();

        // Get all weapon base names to search for
        var weaponDefs = Vanalytics.Core.Data.UltimateWeapons.All;
        var baseNames = weaponDefs.Select(w => w.BaseName).Distinct().ToList();

        // Find all GameItems matching any ultimate weapon name
        var matchingItems = await _db.GameItems
            .Where(gi => baseNames.Contains(gi.Name))
            .Select(gi => new
            {
                gi.ItemId,
                gi.Name,
                gi.IconPath,
                gi.Category,
                gi.ItemLevel,
                gi.Level,
                gi.Damage,
                gi.Delay
            })
            .ToListAsync();

        // Build response: for each weapon def, find matching items the player has held
        var results = new List<object>();

        foreach (var def in weaponDefs.DistinctBy(d => d.BaseName))
        {
            var versions = matchingItems
                .Where(gi => gi.Name == def.BaseName && everHeldIds.Contains(gi.ItemId))
                .Select(gi => new
                {
                    gi.ItemId,
                    gi.Name,
                    gi.IconPath,
                    gi.ItemLevel,
                    gi.Level,
                    gi.Damage,
                    gi.Delay,
                    CurrentlyHeld = currentItemIds.Contains(gi.ItemId)
                })
                .OrderByDescending(v => v.ItemLevel ?? v.Level ?? 0)
                .ToList();

            if (versions.Count > 0)
            {
                results.Add(new
                {
                    BaseName = def.BaseName,
                    def.Category,
                    def.WeaponSkill,
                    Versions = versions
                });
            }
        }

        // Build progress per category
        var progress = weaponDefs
            .DistinctBy(d => d.BaseName)
            .GroupBy(d => d.Category)
            .Select(g => new
            {
                Category = g.Key,
                Total = g.Count(),
                Collected = g.Count(d =>
                    matchingItems.Any(gi => gi.Name == d.BaseName && everHeldIds.Contains(gi.ItemId)))
            })
            .OrderBy(p => p.Category)
            .ToList();

        return Ok(new { progress, weapons = results });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);

        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        _db.Characters.Remove(character);
        await _db.SaveChangesAsync();

        return NoContent();
    }

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    internal static CharacterDetailResponse MapToDetail(Character c) => new()
    {
        Id = c.Id,
        Name = c.Name,
        Server = c.Server,
        IsPublic = c.IsPublic,
        LastSyncAt = c.LastSyncAt,
        Race = c.Race?.ToString(),
        Gender = c.Gender?.ToString(),
        FaceModelId = c.FaceModelId,
        SubJob = c.SubJob,
        SubJobLevel = c.SubJobLevel,
        MasterLevel = c.MasterLevel,
        ItemLevel = c.ItemLevel,
        Hp = c.Hp,
        MaxHp = c.MaxHp,
        Mp = c.Mp,
        MaxMp = c.MaxMp,
        Linkshell = c.Linkshell,
        Nation = c.Nation,
        TitleId = c.TitleId,
        Title = c.Title,
        Merits = c.MeritsJson != null
            ? JsonSerializer.Deserialize<Dictionary<string, int>>(c.MeritsJson)
            : null,
        FavoriteAnimation = c.FavoriteAnimationJson != null
            ? JsonSerializer.Deserialize<FavoriteAnimationDto>(c.FavoriteAnimationJson, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase })
            : null,
        Jobs = c.Jobs.Select(j => new JobEntry
        {
            Job = j.JobId.ToString(),
            Level = j.Level,
            IsActive = j.IsActive,
            JP = j.JP,
            JPSpent = j.JPSpent,
            CP = j.CP
        }).ToList(),
        Gear = c.Gear.Select(g => new GearEntry
        {
            Slot = g.Slot.ToString(),
            ItemId = g.ItemId,
            ItemName = g.ItemName
        }).ToList(),
        CraftingSkills = c.CraftingSkills.Select(s => new CraftingEntry
        {
            Craft = s.Craft.ToString(),
            Level = s.Level,
            Rank = s.Rank
        }).ToList()
    };
}
