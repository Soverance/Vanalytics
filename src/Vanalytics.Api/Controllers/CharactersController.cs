using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.Data;
using Vanalytics.Core.DTOs.Characters;
using Vanalytics.Core.DTOs.GearSets;
using Vanalytics.Core.DTOs.Porter;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Core.DTOs.Blueprints;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Core.Services;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/characters")]
[Authorize]
public class CharactersController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

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
        // Split per collection to avoid a cartesian-product query that
        // duplicates the wide Character row (incl. MeritsJson) across
        // jobs × gear × crafts × skills. See ProfilesController for detail.
        var character = await _db.Characters
            .Include(c => c.Jobs)
            .Include(c => c.Gear)
            .Include(c => c.CraftingSkills)
            .Include(c => c.Skills)
            .AsSplitQuery()
            .FirstOrDefaultAsync(c => c.Id == id);

        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        var detail = MapToDetail(character);
        detail.LinkshellLogoUrl = await LoadActiveLinkshellLogoAsync(_db, character);
        return Ok(detail);
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
        return Ok(await LoadProgressionAsync(_db, id));
    }

    internal static async Task<ProgressionResponse> LoadProgressionAsync(VanalyticsDbContext db, Guid id)
    {
        var masterLevelRows = await db.CharacterJobs
            .Where(j => j.CharacterId == id && j.MasterLevel != null)
            .OrderByDescending(j => j.MasterLevel)
            .ToListAsync();
        var masterLevels = masterLevelRows
            .Select(j => new MasterLevelEntry
            {
                // Export FFXI's 1-based job id (the frontend JOB_NAMES table is
                // 1-based). Casting the 0-based JobType enum directly renders
                // every job one slot off (BLU→SMN, THF→RDM).
                JobId = j.JobId.ToFfxiJobId(),
                MasterLevel = j.MasterLevel!.Value,
                EpCurrent = j.MasterEpCurrent,
                EpNeeded = j.MasterEpNeeded,
                Capped = j.MasterCapped,
            })
            .ToList();

        var row = await db.CharacterProgression.FirstOrDefaultAsync(p => p.CharacterId == id);
        if (row is null)
            return new ProgressionResponse { MasterLevels = masterLevels.Count > 0 ? masterLevels : null };

        return new ProgressionResponse
        {
            LimitPoints = row.LimitPoints,
            MeritPoints = row.MeritPoints,
            MeritPointsMax = row.MeritPointsMax,
            JobPointsUnlocked = row.JobPointsUnlocked,
            JobPoints = row.JobPointsJson is null ? null
                : JsonSerializer.Deserialize<List<JobPointEntry>>(row.JobPointsJson, JsonOpts),
            Warps = row.WarpsJson is null ? null
                : JsonSerializer.Deserialize<WarpUnlocks>(row.WarpsJson, JsonOpts),
            MasterLevels = masterLevels.Count > 0 ? masterLevels : null,
            UpdatedAt = row.UpdatedAt,
        };
    }

    [HttpGet("{id:guid}/collection")]
    public async Task<IActionResult> GetCollection(Guid id)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();
        return Ok(await LoadCollectionAsync(_db, id));
    }

    internal static async Task<CollectionResponse> LoadCollectionAsync(VanalyticsDbContext db, Guid id)
    {
        var row = await db.CharacterCollection.FirstOrDefaultAsync(c => c.CharacterId == id);
        if (row is null) return new CollectionResponse();

        return new CollectionResponse
        {
            SpellIds = row.SpellIdsJson is null ? null
                : JsonSerializer.Deserialize<List<int>>(row.SpellIdsJson, JsonOpts),
            KeyItemIds = row.KeyItemIdsJson is null ? null
                : JsonSerializer.Deserialize<List<int>>(row.KeyItemIdsJson, JsonOpts),
            UpdatedAt = row.UpdatedAt,
        };
    }

    [HttpGet("{id:guid}/titles")]
    public async Task<IActionResult> GetTitles(Guid id)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();
        return Ok(await LoadTitlesAsync(_db, id));
    }

    internal static async Task<TitlesResponse> LoadTitlesAsync(VanalyticsDbContext db, Guid id)
    {
        // Deliberate lightweight re-query: keeps this loader self-contained (signature: db, id)
        // so it can be shared by both the authenticated and public (ProfilesController) paths.
        var currentTitleId = await db.Characters
            .Where(c => c.Id == id).Select(c => c.TitleId).FirstOrDefaultAsync();

        var titles = await db.CharacterTitles
            .Where(t => t.CharacterId == id)
            .OrderByDescending(t => t.FirstSeenAt)
            .Select(t => new TitleEntry
            {
                TitleId = t.TitleId,
                FirstSeenAt = t.FirstSeenAt,
                LastEquippedAt = t.LastEquippedAt,
            })
            .ToListAsync();

        return new TitlesResponse { CurrentTitleId = currentTitleId, Titles = titles };
    }

    [HttpGet("{id:guid}/linkshells")]
    public async Task<IActionResult> GetLinkshells(Guid id)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();
        return Ok(await LoadLinkshellsAsync(_db, id));
    }

    internal static async Task<LinkshellsResponse> LoadLinkshellsAsync(VanalyticsDbContext db, Guid id)
    {
        // Every linkshell this character has ever synced with — current ones
        // first, then former (departed) ones, each most-recently-seen first.
        var linkshells = await db.LinkshellMemberships
            .Where(m => m.CharacterId == id)
            .OrderByDescending(m => m.IsCurrent)
            .ThenByDescending(m => m.LastSeenAt)
            .Select(m => new CharacterLinkshellEntry
            {
                Name = m.Linkshell.Name,
                ColorRgb = m.Linkshell.ColorRgb,
                LogoUrl = m.Linkshell.Profile != null ? m.Linkshell.Profile.LogoBlobUrl : null,
                Rank = m.Rank.ToString(),
                IsCurrent = m.IsCurrent,
                LastSeenAt = m.LastSeenAt,
            })
            .ToListAsync();

        return new LinkshellsResponse { Linkshells = linkshells };
    }

    // The active linkshell's custom logo (or null), for the profile-header mark.
    // The active LS is the character's current membership whose Linkshell.Name
    // matches the denormalized active name (c.Linkshell); resolve its profile
    // logo. Returns null when there's no active LS or it has no logo.
    internal static Task<string?> LoadActiveLinkshellLogoAsync(VanalyticsDbContext db, Character c)
    {
        if (string.IsNullOrEmpty(c.Linkshell)) return Task.FromResult<string?>(null);
        return db.LinkshellMemberships
            .Where(m => m.CharacterId == c.Id && m.IsCurrent
                && m.Linkshell.Server == c.Server && m.Linkshell.Name == c.Linkshell)
            .Select(m => m.Linkshell.Profile != null ? m.Linkshell.Profile.LogoBlobUrl : null)
            .FirstOrDefaultAsync();
    }

    [HttpGet("{id:guid}/missions")]
    public async Task<IActionResult> GetMissions(Guid id)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();
        return Ok(await LoadMissionsAsync(_db, id));
    }

    internal static async Task<MissionsResponse> LoadMissionsAsync(VanalyticsDbContext db, Guid id)
    {
        var row = await db.CharacterMissions.FirstOrDefaultAsync(m => m.CharacterId == id);
        if (row is null) return new MissionsResponse();

        var dict = row.MissionsJson is null
            ? new Dictionary<string, MissionLineState>()
            : JsonSerializer.Deserialize<Dictionary<string, MissionLineState>>(row.MissionsJson, JsonOpts)
              ?? new Dictionary<string, MissionLineState>();

        return new MissionsResponse
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
        };
    }

    [HttpGet("{id:guid}/relics")]
    public async Task<IActionResult> GetRelics(Guid id)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();
        return Ok(await LoadRelicsAsync(_db, id));
    }

    internal static async Task<object> LoadRelicsAsync(VanalyticsDbContext db, Guid id)
    {
        var currentItemIds = await db.CharacterInventories
            .Where(i => i.CharacterId == id).Select(i => i.ItemId).Distinct().ToListAsync();
        var historicalItemIds = await db.InventoryChanges
            .Where(c => c.CharacterId == id && c.ChangeType == Vanalytics.Core.Enums.InventoryChangeType.Added)
            .Select(c => c.ItemId).Distinct().ToListAsync();
        var everHeldIds = currentItemIds.Union(historicalItemIds).ToHashSet();

        var weaponDefs = Vanalytics.Core.Data.UltimateWeapons.All;
        var baseNames = weaponDefs.Select(w => w.BaseName).Distinct().ToList();
        var matchingItems = await db.GameItems
            .Where(gi => baseNames.Contains(gi.Name))
            .Select(gi => new { gi.ItemId, gi.Name, gi.IconPath, gi.Category, gi.ItemLevel, gi.Level, gi.Damage, gi.Delay, gi.Description })
            .ToListAsync();

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
                    return new { rep.ItemId, rep.Name, rep.IconPath, rep.ItemLevel, rep.Level, rep.Damage, rep.Delay, Stage = g.Key, rep.Rank, CurrentlyHeld = g.Any(v => v.CurrentlyHeld) };
                })
                .OrderBy(v => v.Rank)
                .Select(v => new { v.ItemId, v.Name, v.IconPath, v.ItemLevel, v.Level, v.Damage, v.Delay, v.Stage, v.CurrentlyHeld })
                .ToList();

            if (versions.Count > 0)
                results.Add(new { BaseName = def.BaseName, def.Category, def.WeaponSkill, Versions = versions });
        }

        var progress = weaponDefs.DistinctBy(d => d.BaseName).GroupBy(d => d.Category)
            .Select(g => new { Category = g.Key, Total = g.Count(), Collected = g.Count(d => matchingItems.Any(gi => gi.Name == d.BaseName && everHeldIds.Contains(gi.ItemId))) })
            .OrderBy(p => p.Category).ToList();

        return new { progress, weapons = results };
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

    [HttpGet("{id:guid}/gear-sets/owned-equipment")]
    public async Task<IActionResult> GetOwnedEquipment(Guid id)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        var invRaw = await _db.CharacterInventories
            .Where(i => i.CharacterId == id)
            .Join(_db.GameItems, ci => ci.ItemId, gi => gi.ItemId, (ci, gi) => new
            {
                gi.ItemId,
                ItemName = gi.Name ?? gi.NameJa ?? "Unknown",
                gi.IconPath,
                gi.Slots,
                gi.Jobs,
                ci.AugmentsJson
            })
            .Where(x => x.Slots != null && x.Slots != 0)
            .ToListAsync();

        var gearRaw = await _db.EquippedGear
            .Where(g => g.CharacterId == id && g.ItemId != 0)
            .Join(_db.GameItems, g => g.ItemId, gi => gi.ItemId, (g, gi) => new
            {
                g.ItemId,
                ItemName = string.IsNullOrEmpty(g.ItemName) ? (gi.Name ?? gi.NameJa ?? "Unknown") : g.ItemName,
                gi.IconPath,
                gi.Slots,
                gi.Jobs,
                g.AugmentsJson
            })
            .Where(x => x.Slots != null && x.Slots != 0)
            .ToListAsync();

        static List<string> ParseAug(string? json) => json != null
            ? JsonSerializer.Deserialize<List<string>>(json) ?? []
            : [];

        var combined = invRaw
            .Select(x => new OwnedEquipmentItem
            {
                ItemId = x.ItemId, ItemName = x.ItemName, IconPath = x.IconPath,
                Slots = x.Slots, Jobs = x.Jobs, Augments = ParseAug(x.AugmentsJson)
            })
            .Concat(gearRaw.Select(x => new OwnedEquipmentItem
            {
                ItemId = x.ItemId, ItemName = x.ItemName, IconPath = x.IconPath,
                Slots = x.Slots, Jobs = x.Jobs, Augments = ParseAug(x.AugmentsJson)
            }))
            .GroupBy(x => $"{x.ItemId}|{string.Join("|", x.Augments)}")
            .Select(g => g.First())
            .OrderBy(x => x.ItemName)
            .ToList();

        return Ok(combined);
    }

    // ─── DEFERRED CONTRACT (GearSwap codegen) ────────────────────────────────────
    // GET {id}/gear-sets/details?job={job}&category={category}
    //   -> GearSetDetailResponse[] (full slots) for all matching sets.
    // The read path the future GearSwap Lua codegen will consume: bulk retrieval of a
    // character+job's sets, grouped client-side by Category into GearSwap namespaces.
    // Intentionally NOT implemented yet. See
    // docs/superpowers/specs/2026-06-07-gear-sets-discovery-management-design.md.
    // ─────────────────────────────────────────────────────────────────────────────
    [HttpGet("{id:guid}/gear-sets")]
    public async Task<IActionResult> GetGearSets(Guid id)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();
        return Ok(await LoadGearSetsAsync(_db, id));
    }

    internal static async Task<List<GearSetSummaryResponse>> LoadGearSetsAsync(VanalyticsDbContext db, Guid id)
    {
        var rows = await db.CharacterGearSets
            .Where(s => s.CharacterId == id)
            .OrderByDescending(s => s.UpdatedAt)
            .Select(s => new { s.Id, s.Name, s.Job, s.Category, s.TagsJson, SlotCount = s.Slots.Count, s.UpdatedAt })
            .ToListAsync();

        return rows.Select(r => new GearSetSummaryResponse
        {
            Id = r.Id,
            Name = r.Name,
            Job = r.Job,
            Category = r.Category,
            Tags = DeserializeTags(r.TagsJson),
            SlotCount = r.SlotCount,
            UpdatedAt = r.UpdatedAt
        }).ToList();
    }

    [HttpGet("{id:guid}/gear-sets/{setId:long}")]
    public async Task<IActionResult> GetGearSet(Guid id, long setId)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();
        var detail = await LoadGearSetAsync(_db, id, setId);
        return detail is null ? NotFound() : Ok(detail);
    }

    internal static async Task<GearSetDetailResponse?> LoadGearSetAsync(VanalyticsDbContext db, Guid id, long setId)
    {
        var set = await db.CharacterGearSets
            .Include(s => s.Slots)
            .FirstOrDefaultAsync(s => s.Id == setId && s.CharacterId == id);
        return set is null ? null : ToDetail(set);
    }

    [HttpPost("{id:guid}/gear-sets")]
    public async Task<IActionResult> CreateGearSet(Guid id, [FromBody] SaveGearSetRequest request)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { message = "Name is required." });
        if (!TryNormalizeJob(request.Job, out var job))
            return BadRequest(new { message = "Invalid job." });
        if (!TryNormalizeCategory(request.Category, out var category))
            return BadRequest(new { message = "Invalid category." });

        var count = await _db.CharacterGearSets.CountAsync(s => s.CharacterId == id);
        if (count >= MaxGearSetsPerCharacter)
            return Conflict(new { message = $"This character already has the maximum of {MaxGearSetsPerCharacter} gear sets. Delete one to make room." });

        var now = DateTimeOffset.UtcNow;
        var set = new CharacterGearSet
        {
            CharacterId = id,
            Name = request.Name.Trim(),
            Job = job,
            Category = category,
            TagsJson = JsonSerializer.Serialize(NormalizeTags(request.Tags)),
            CreatedAt = now,
            UpdatedAt = now
        };
        foreach (var slot in ToSlotEntities(request))
            set.Slots.Add(slot);
        _db.CharacterGearSets.Add(set);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetGearSet), new { id, setId = set.Id }, ToDetail(set));
    }

    [HttpPut("{id:guid}/gear-sets/{setId:long}")]
    public async Task<IActionResult> UpdateGearSet(Guid id, long setId, [FromBody] SaveGearSetRequest request)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { message = "Name is required." });
        if (!TryNormalizeJob(request.Job, out var job))
            return BadRequest(new { message = "Invalid job." });
        if (!TryNormalizeCategory(request.Category, out var category))
            return BadRequest(new { message = "Invalid category." });

        var set = await _db.CharacterGearSets
            .Include(s => s.Slots)
            .FirstOrDefaultAsync(s => s.Id == setId && s.CharacterId == id);
        if (set is null) return NotFound();

        set.Name = request.Name.Trim();
        set.Job = job;
        set.Category = category;
        set.TagsJson = JsonSerializer.Serialize(NormalizeTags(request.Tags));
        // Full-replace: delete the existing slot rows before adding the incoming ones.
        // Order matters — clearing first would no-op the RemoveRange and orphan the rows.
        _db.GearSetSlots.RemoveRange(set.Slots);
        set.Slots.Clear();
        foreach (var slot in ToSlotEntities(request))
            set.Slots.Add(slot);
        set.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(ToDetail(set));
    }

    [HttpDelete("{id:guid}/gear-sets/{setId:long}")]
    public async Task<IActionResult> DeleteGearSet(Guid id, long setId)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();

        var set = await _db.CharacterGearSets
            .FirstOrDefaultAsync(s => s.Id == setId && s.CharacterId == id);
        if (set is null) return NotFound();

        _db.CharacterGearSets.Remove(set);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("{id:guid}/blueprints/{job}")]
    public async Task<IActionResult> GetBlueprint(Guid id, string job)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();
        if (!TryNormalizeJob(job, out var normalized) || normalized is null)
            return BadRequest(new { message = "Invalid job." });

        var wf = await _db.CharacterJobBlueprints
            .FirstOrDefaultAsync(w => w.CharacterId == id && w.Job == normalized);

        return Ok(new BlueprintResponse
        {
            Job = normalized,
            Graph = wf is null
                ? new BlueprintGraphDto()
                : JsonSerializer.Deserialize<BlueprintGraphDto>(wf.GraphJson, JsonOpts) ?? new BlueprintGraphDto(),
            UpdatedAt = wf?.UpdatedAt
        });
    }

    [HttpPut("{id:guid}/blueprints/{job}")]
    public async Task<IActionResult> SaveBlueprint(Guid id, string job, [FromBody] BlueprintGraphDto graph)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();
        if (!TryNormalizeJob(job, out var normalized) || normalized is null)
            return BadRequest(new { message = "Invalid job." });

        var now = DateTimeOffset.UtcNow;
        var json = JsonSerializer.Serialize(graph ?? new BlueprintGraphDto(), JsonOpts);
        var wf = await _db.CharacterJobBlueprints
            .FirstOrDefaultAsync(w => w.CharacterId == id && w.Job == normalized);
        if (wf is null)
        {
            wf = new CharacterJobBlueprint
            {
                CharacterId = id, Job = normalized, GraphJson = json,
                CreatedAt = now, UpdatedAt = now
            };
            _db.CharacterJobBlueprints.Add(wf);
        }
        else
        {
            wf.GraphJson = json;
            wf.UpdatedAt = now;
        }
        await _db.SaveChangesAsync();

        return Ok(new BlueprintResponse { Job = normalized, Graph = graph ?? new BlueprintGraphDto(), UpdatedAt = wf.UpdatedAt });
    }

    [HttpPost("{id:guid}/blueprints/{job}/generate")]
    public async Task<IActionResult> GenerateBlueprint(Guid id, string job)
    {
        var userId = GetUserId();
        var character = await _db.Characters.FirstOrDefaultAsync(c => c.Id == id);
        if (character is null) return NotFound();
        if (character.UserId != userId) return Forbid();
        if (!TryNormalizeJob(job, out var normalized) || normalized is null)
            return BadRequest(new { message = "Invalid job." });

        var wf = await _db.CharacterJobBlueprints
            .FirstOrDefaultAsync(w => w.CharacterId == id && w.Job == normalized);
        var graph = wf is null
            ? new BlueprintGraphDto()
            : JsonSerializer.Deserialize<BlueprintGraphDto>(wf.GraphJson, JsonOpts) ?? new BlueprintGraphDto();

        var modeSetIds = graph.Nodes
            .Where(n => n.Type == "mode")
            .SelectMany(n => n.Data.Members ?? [])
            .Select(m => m.GearSetId);

        var referencedIds = graph.Nodes
            .Where(n => n.Type == "equip" && n.Data.GearSetId is not null)
            .Select(n => n.Data.GearSetId!.Value)
            .Concat(modeSetIds)
            .Distinct()
            .ToList();

        var sets = await _db.CharacterGearSets
            .Where(s => s.CharacterId == id && referencedIds.Contains(s.Id))
            .Include(s => s.Slots)
            .ToListAsync();

        var resolved = sets.Select(s => new ResolvedGearSet(
            s.Id, s.Name,
            s.Slots.Select(sl => new ResolvedSlot(
                sl.Slot, sl.ItemId, sl.ItemName,
                DeserializeAugments(sl.AugmentsJson))).ToList()))
            .ToList();

        var result = GearSwapCodeGenerator.Generate(graph, resolved);
        return Ok(new GenerateBlueprintResponse { Lua = result.Lua, Warnings = result.Warnings });
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

    // Per-character ceiling on saved gear sets — bounds DB growth; far above realistic use.
    // Mirrored client-side by MAX_GEAR_SETS_PER_CHARACTER in GearSetsTab.tsx (keep in sync).
    private const int MaxGearSetsPerCharacter = 500;

    // Validates the optional gear-set job tag against the real FFXI job list, returning the
    // canonical uppercase code (e.g. "thf" -> "THF"). Null/blank is allowed (job is optional).
    private static bool TryNormalizeJob(string? job, out string? normalized)
    {
        normalized = null;
        if (string.IsNullOrWhiteSpace(job)) return true;
        if (Enum.TryParse<Vanalytics.Core.Enums.JobType>(job.Trim(), ignoreCase: true, out var parsed))
        {
            normalized = parsed.ToString();
            return true;
        }
        return false;
    }

    // Validates the gear-set category against the GearSetCategory enum, returning the canonical
    // enum name. Null/blank defaults to "Other"; an unrecognized value is rejected.
    private static bool TryNormalizeCategory(string? category, out string normalized)
    {
        normalized = "Other";
        if (string.IsNullOrWhiteSpace(category)) return true;
        if (Enum.TryParse<Vanalytics.Core.Enums.GearSetCategory>(category.Trim(), ignoreCase: true, out var parsed))
        {
            normalized = parsed.ToString();
            return true;
        }
        return false;
    }

    private const int MaxTags = 20;
    private const int MaxTagLength = 30;

    // Trims, drops empties, dedupes case-insensitively (first casing wins), caps tag length
    // and total count. Tags are a free-form Vanalytics-only layer, so out-of-range input is
    // normalized rather than rejected.
    private static List<string> NormalizeTags(List<string>? tags)
    {
        if (tags is null) return [];
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<string>();
        foreach (var raw in tags)
        {
            if (string.IsNullOrWhiteSpace(raw)) continue;
            var t = raw.Trim();
            if (t.Length > MaxTagLength) t = t[..MaxTagLength];
            if (seen.Add(t)) result.Add(t);
            if (result.Count >= MaxTags) break;
        }
        return result;
    }

    private static List<string> DeserializeTags(string tagsJson) =>
        JsonSerializer.Deserialize<List<string>>(tagsJson) ?? [];

    private static List<GearSetSlot> ToSlotEntities(SaveGearSetRequest request) =>
        (request.Slots ?? []).Select(s => new GearSetSlot
        {
            Slot = s.Slot,
            ItemId = s.ItemId,
            ItemName = s.ItemName ?? string.Empty,
            AugmentsJson = s.Augments is { Count: > 0 } ? JsonSerializer.Serialize(s.Augments) : null
        }).ToList();

    private static List<string> DeserializeAugments(string? json) =>
        string.IsNullOrEmpty(json) ? [] : (JsonSerializer.Deserialize<List<string>>(json) ?? []);

    private static GearSetDetailResponse ToDetail(CharacterGearSet s) => new()
    {
        Id = s.Id,
        Name = s.Name,
        Job = s.Job,
        Category = s.Category,
        Tags = DeserializeTags(s.TagsJson),
        Slots = s.Slots.Select(sl => new GearSetSlotDto
        {
            Slot = sl.Slot,
            ItemId = sl.ItemId,
            ItemName = sl.ItemName,
            Augments = DeserializeAugments(sl.AugmentsJson)
        }).ToList(),
        CreatedAt = s.CreatedAt,
        UpdatedAt = s.UpdatedAt
    };

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
        SuperiorLevel = c.SuperiorLevel,
        ItemLevel = c.ItemLevel,
        Hp = c.Hp,
        MaxHp = c.MaxHp,
        Mp = c.Mp,
        MaxMp = c.MaxMp,
        Linkshell = c.Linkshell,
        LinkshellSlot = c.LinkshellSlot,
        LinkshellColorRgb = c.LinkshellColorRgb,
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
