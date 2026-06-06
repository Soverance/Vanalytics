using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.Data;
using Vanalytics.Core.DTOs.Characters;
using Vanalytics.Core.DTOs.Porter;
using Vanalytics.Core.DTOs.Sync;
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
            .Include(c => c.Skills)
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

        var rawItems = await _db.CharacterInventories
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
                    ci.AugmentsJson,
                    ItemName = gi.Name ?? gi.NameJa ?? "Unknown",
                    gi.IconPath,
                    gi.Category,
                    gi.StackSize,
                    gi.BaseSell,
                    IsRare = (gi.Flags & 0x8000) != 0,
                    IsExclusive = (gi.Flags & 0x4000) != 0
                })
            .OrderBy(i => i.Bag)
            .ThenBy(i => i.ItemName)
            .ToListAsync();

        var items = rawItems.Select(i => new
        {
            i.ItemId,
            i.Bag,
            i.SlotIndex,
            i.Quantity,
            i.LastSeenAt,
            i.ItemName,
            i.IconPath,
            i.Category,
            i.StackSize,
            i.BaseSell,
            i.IsRare,
            i.IsExclusive,
            Augments = i.AugmentsJson != null
                ? JsonSerializer.Deserialize<List<string>>(i.AugmentsJson) ?? []
                : []
        }).ToList();

        var grouped = items
            .GroupBy(i => i.Bag)
            .ToDictionary(g => g.Key, g => g.ToList());

        return Ok(grouped);
    }

    [HttpGet("{id:guid}/progression")]
    public async Task<IActionResult> GetProgression(Guid id)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);

        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        var row = await _db.CharacterProgression
            .FirstOrDefaultAsync(p => p.CharacterId == id);

        if (row is null)
        {
            // No packet data has arrived yet — return an empty shell so the UI can show its empty state.
            return Ok(new ProgressionResponse());
        }

        // Stored JSON is camelCase (written via ProgressionController.JsonOpts).
        // Deserialize with the matching naming policy — otherwise all fields
        // silently fall back to defaults (empty arrays, zeros).
        var jsonOpts = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

        return Ok(new ProgressionResponse
        {
            LimitPoints = row.LimitPoints,
            MeritPoints = row.MeritPoints,
            MeritPointsMax = row.MeritPointsMax,
            JobPointsUnlocked = row.JobPointsUnlocked,
            JobPoints = row.JobPointsJson is null
                ? null
                : JsonSerializer.Deserialize<List<JobPointEntry>>(row.JobPointsJson, jsonOpts),
            Warps = row.WarpsJson is null
                ? null
                : JsonSerializer.Deserialize<WarpUnlocks>(row.WarpsJson, jsonOpts),
            UpdatedAt = row.UpdatedAt,
        });
    }

    [HttpGet("{id:guid}/collection")]
    public async Task<IActionResult> GetCollection(Guid id)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);

        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        var row = await _db.CharacterCollection
            .FirstOrDefaultAsync(c => c.CharacterId == id);

        if (row is null) return Ok(new CollectionResponse());

        var jsonOpts = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

        return Ok(new CollectionResponse
        {
            SpellIds = row.SpellIdsJson is null
                ? null
                : JsonSerializer.Deserialize<List<int>>(row.SpellIdsJson, jsonOpts),
            KeyItemIds = row.KeyItemIdsJson is null
                ? null
                : JsonSerializer.Deserialize<List<int>>(row.KeyItemIdsJson, jsonOpts),
            UpdatedAt = row.UpdatedAt,
        });
    }

    [HttpGet("{id:guid}/titles")]
    public async Task<IActionResult> GetTitles(Guid id)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);

        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        var titles = await _db.CharacterTitles
            .Where(t => t.CharacterId == id)
            .OrderByDescending(t => t.FirstSeenAt)
            .Select(t => new TitleEntry
            {
                TitleId = t.TitleId,
                FirstSeenAt = t.FirstSeenAt,
                LastEquippedAt = t.LastEquippedAt,
            })
            .ToListAsync();

        return Ok(new TitlesResponse
        {
            CurrentTitleId = character.TitleId,
            Titles = titles,
        });
    }

    [HttpGet("{id:guid}/missions")]
    public async Task<IActionResult> GetMissions(Guid id)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);

        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        var row = await _db.CharacterMissions
            .FirstOrDefaultAsync(m => m.CharacterId == id);

        if (row is null) return Ok(new MissionsResponse());

        var jsonOpts = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

        // Stored as Dictionary<string, MissionLineState> with camelCase keys.
        var dict = row.MissionsJson is null
            ? new Dictionary<string, MissionLineState>()
            : JsonSerializer.Deserialize<Dictionary<string, MissionLineState>>(row.MissionsJson, jsonOpts)
              ?? new Dictionary<string, MissionLineState>();

        return Ok(new MissionsResponse
        {
            SandoriaMissions = dict.GetValueOrDefault("sandoriaMissions"),
            BastokMissions = dict.GetValueOrDefault("bastokMissions"),
            WindurstMissions = dict.GetValueOrDefault("windurstMissions"),
            ZilartMissions = dict.GetValueOrDefault("zilartMissions"),
            AhturhganMissions = dict.GetValueOrDefault("ahturhganMissions"),
            WotgMissions = dict.GetValueOrDefault("wotgMissions"),
            Assaults = dict.GetValueOrDefault("assaults"),
            CopMissions = dict.GetValueOrDefault("copMissions"),
            AcpMissions = dict.GetValueOrDefault("acpMissions"),
            MkdMissions = dict.GetValueOrDefault("mkdMissions"),
            AsaMissions = dict.GetValueOrDefault("asaMissions"),
            SoaMissions = dict.GetValueOrDefault("soaMissions"),
            RovMissions = dict.GetValueOrDefault("rovMissions"),
            TvrMissions = dict.GetValueOrDefault("tvrMissions"),
            UpdatedAt = row.UpdatedAt,
        });
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
                gi.Delay,
                gi.Description
            })
            .ToListAsync();

        // Build response: for each weapon def, find matching items the player has held,
        // collapse duplicate ItemIds at the same stage, and order by canonical progression.
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
                    Stage = UltimateWeaponStage.Derive(gi.Level, gi.ItemLevel, gi.Description),
                    Rank = UltimateWeaponStage.Rank(gi.Level, gi.ItemLevel, gi.Description),
                    CurrentlyHeld = currentItemIds.Contains(gi.ItemId)
                })
                .GroupBy(v => v.Stage)
                .Select(g =>
                {
                    var rep = g.OrderByDescending(v => v.CurrentlyHeld).First();
                    return new
                    {
                        rep.ItemId,
                        rep.Name,
                        rep.IconPath,
                        rep.ItemLevel,
                        rep.Level,
                        rep.Damage,
                        rep.Delay,
                        Stage = g.Key,
                        rep.Rank,
                        CurrentlyHeld = g.Any(v => v.CurrentlyHeld)
                    };
                })
                .OrderBy(v => v.Rank)
                .Select(v => new
                {
                    v.ItemId,
                    v.Name,
                    v.IconPath,
                    v.ItemLevel,
                    v.Level,
                    v.Damage,
                    v.Delay,
                    v.Stage,
                    v.CurrentlyHeld
                })
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

    [HttpGet("{id:guid}/porter")]
    public async Task<IActionResult> GetPorter(Guid id)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);

        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        var slips = await _db.CharacterPorterSlips
            .Where(s => s.CharacterId == id)
            .Join(_db.GameItems,
                s => s.SlipItemId,
                gi => gi.ItemId,
                (s, gi) => new
                {
                    s.SlipItemId,
                    s.SlipNumber,
                    s.SyncedAt,
                    s.UserHidden,
                    SlipName = gi.Name ?? gi.NameJa ?? "Unknown",
                    gi.IconPath
                })
            .ToListAsync();

        var items = await _db.CharacterPorterItems
            .Where(p => p.CharacterId == id)
            .Join(_db.GameItems,
                p => p.ItemId,
                gi => gi.ItemId,
                (p, gi) => new
                {
                    p.SlipItemId,
                    p.ItemId,
                    ItemName = gi.Name ?? gi.NameJa ?? "Unknown",
                    gi.IconPath,
                    gi.Category,
                    gi.StackSize,
                    gi.BaseSell,
                    IsRare = (gi.Flags & 0x8000) != 0,
                    IsExclusive = (gi.Flags & 0x4000) != 0
                })
            .ToListAsync();

        var itemsBySlip = items
            .GroupBy(i => i.SlipItemId)
            .ToDictionary(g => g.Key, g => g.ToList());

        var response = slips
            .OrderBy(s => s.SlipNumber)
            .Select(s => new PorterSlipResponse
            {
                SlipItemId = s.SlipItemId,
                SlipNumber = s.SlipNumber,
                SlipName = s.SlipName,
                SlipIconPath = s.IconPath,
                SyncedAt = s.SyncedAt,
                UserHidden = s.UserHidden,
                Items = itemsBySlip.TryGetValue(s.SlipItemId, out var slipItems)
                    ? slipItems.OrderBy(i => i.ItemName).Select(i => new PorterItemResponse
                    {
                        ItemId = i.ItemId,
                        ItemName = i.ItemName,
                        IconPath = i.IconPath,
                        Category = i.Category,
                        BaseSell = i.BaseSell,
                        StackSize = i.StackSize,
                        IsRare = i.IsRare,
                        IsExclusive = i.IsExclusive
                    }).ToList()
                    : []
            })
            .ToList();

        return Ok(response);
    }

    [HttpPatch("{id:guid}/porter/{slipItemId:int}")]
    public async Task<IActionResult> UpdatePorterSlip(Guid id, int slipItemId, [FromBody] UpdatePorterSlipRequest request)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);

        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        var slip = await _db.CharacterPorterSlips
            .FirstOrDefaultAsync(s => s.CharacterId == id && s.SlipItemId == slipItemId);

        if (slip is null) return NotFound();

        slip.UserHidden = request.UserHidden;
        await _db.SaveChangesAsync();

        return NoContent();
    }

    [HttpDelete("{id:guid}/porter/{slipItemId:int}")]
    public async Task<IActionResult> ForgetPorterSlip(Guid id, int slipItemId)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);

        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        var slip = await _db.CharacterPorterSlips
            .FirstOrDefaultAsync(s => s.CharacterId == id && s.SlipItemId == slipItemId);

        if (slip is null) return NotFound();

        var items = await _db.CharacterPorterItems
            .Where(p => p.CharacterId == id && p.SlipItemId == slipItemId)
            .ToListAsync();

        _db.CharacterPorterItems.RemoveRange(items);
        _db.CharacterPorterSlips.Remove(slip);
        await _db.SaveChangesAsync();

        return NoContent();
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
        NationRank = c.NationRank,
        RankPoints = c.RankPoints,
        TitleId = c.TitleId,
        Title = c.Title,
        BaseStr = c.BaseStr,
        BaseDex = c.BaseDex,
        BaseVit = c.BaseVit,
        BaseAgi = c.BaseAgi,
        BaseInt = c.BaseInt,
        BaseMnd = c.BaseMnd,
        BaseChr = c.BaseChr,
        AddedStr = c.AddedStr,
        AddedDex = c.AddedDex,
        AddedVit = c.AddedVit,
        AddedAgi = c.AddedAgi,
        AddedInt = c.AddedInt,
        AddedMnd = c.AddedMnd,
        AddedChr = c.AddedChr,
        Attack = c.Attack,
        Defense = c.Defense,
        ResFire = c.ResFire,
        ResIce = c.ResIce,
        ResWind = c.ResWind,
        ResEarth = c.ResEarth,
        ResLightning = c.ResLightning,
        ResWater = c.ResWater,
        ResLight = c.ResLight,
        ResDark = c.ResDark,
        PlaytimeSeconds = c.PlaytimeSeconds,
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
            ItemName = g.ItemName,
            Augments = g.AugmentsJson != null
                ? JsonSerializer.Deserialize<List<string>>(g.AugmentsJson) ?? []
                : []
        }).ToList(),
        CraftingSkills = c.CraftingSkills.Select(s => new CraftingEntry
        {
            Craft = s.Craft.ToString(),
            Level = s.Level,
            Rank = s.Rank
        }).ToList(),
        Skills = c.Skills.Select(s => new SkillEntry
        {
            Skill = s.Skill.ToString(),
            Level = s.Level,
            Cap = s.Cap
        }).ToList()
    };
}
