using System.Linq.Expressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.DTOs;
using Vanalytics.Core.DTOs.Characters;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/items")]
public class ItemsController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    public ItemsController(VanalyticsDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> Search(
        [FromQuery] string? q = null,
        [FromQuery] string? category = null,
        [FromQuery] int? skill = null,
        [FromQuery] int? minLevel = null,
        [FromQuery] int? maxLevel = null,
        [FromQuery] string? jobs = null,
        [FromQuery(Name = "stats")] string[]? stats = null,
        [FromQuery] string? slots = null,
        [FromQuery] string? subCategory = null,
        [FromQuery] string? flags = null,
        [FromQuery] string? sortBy = null,
        [FromQuery] string? sortDir = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25)
    {
        if (pageSize > 100) pageSize = 100;
        if (page < 1) page = 1;

        var query = _db.GameItems.AsQueryable();

        if (!string.IsNullOrEmpty(q))
            query = query.Where(i => i.Name.Contains(q));

        if (!string.IsNullOrEmpty(category))
            query = query.Where(i => i.Category == category);

        if (skill.HasValue)
            query = query.Where(i => i.Skill == skill.Value);

        if (!string.IsNullOrEmpty(subCategory))
            query = query.Where(i => i.SubCategory == subCategory);

        if (minLevel.HasValue)
            query = query.Where(i => i.Level >= minLevel.Value);

        if (maxLevel.HasValue)
            query = query.Where(i => i.Level <= maxLevel.Value);

        if (!string.IsNullOrEmpty(jobs))
        {
            var jobBit = GetJobBitmask(jobs);
            if (jobBit.HasValue)
                query = query.Where(i => i.Jobs != null && (i.Jobs.Value & jobBit.Value) != 0);
        }

        // Stat filters: stats=STR:10:&stats=DEF::50
        if (stats is { Length: > 0 })
        {
            foreach (var stat in stats)
            {
                var parts = stat.Split(':');
                if (parts.Length < 2)
                    return BadRequest(new { message = $"Invalid stat filter format: '{stat}'. Expected 'StatName:Min:Max'." });
                var statName = parts[0];
                if (!StatExpressions.TryGetValue(statName, out var statExpr))
                    return BadRequest(new { message = $"Unknown stat name: '{statName}'." });
                int? min = parts.Length > 1 && int.TryParse(parts[1], out var mn) ? mn : null;
                int? max = parts.Length > 2 && int.TryParse(parts[2], out var mx) ? mx : null;
                if (!min.HasValue && !max.HasValue) continue;
                query = query.Where(BuildStatFilter(statExpr, min, max));
            }
        }

        // Slots filter: slots=Head,Body (OR'd bitmask)
        if (!string.IsNullOrEmpty(slots))
        {
            int slotMask = 0;
            foreach (var slotName in slots.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (!SlotBitmasks.TryGetValue(slotName, out var bit))
                    return BadRequest(new { message = $"Unknown slot name: '{slotName}'." });
                slotMask |= bit;
            }
            if (slotMask != 0)
                query = query.Where(i => i.Slots != null && (i.Slots.Value & slotMask) != 0);
        }

        // Flags filter: flags=rare,exclusive
        if (!string.IsNullOrEmpty(flags))
        {
            foreach (var flagName in flags.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (!FlagBitmasks.TryGetValue(flagName, out var flagBit))
                    return BadRequest(new { message = $"Unknown flag: '{flagName}'." });
                var bit = flagBit;
                query = query.Where(i => (i.Flags & bit) != 0);
            }
        }

        var totalCount = await query.CountAsync();

        // Sorting
        var desc = string.Equals(sortDir, "desc", StringComparison.OrdinalIgnoreCase);
        if (!string.IsNullOrEmpty(sortBy) && string.Equals(sortBy, "level", StringComparison.OrdinalIgnoreCase))
        {
            query = desc ? query.OrderByDescending(i => i.Level) : query.OrderBy(i => i.Level);
        }
        else if (!string.IsNullOrEmpty(sortBy) && string.Equals(sortBy, "itemLevel", StringComparison.OrdinalIgnoreCase))
        {
            query = desc ? query.OrderByDescending(i => i.ItemLevel) : query.OrderBy(i => i.ItemLevel);
        }
        else if (!string.IsNullOrEmpty(sortBy) && StatExpressions.TryGetValue(sortBy, out var sortExpr))
        {
            // Sort by a stat column — nulls sort last
            if (desc)
                query = query.OrderByDescending(sortExpr).ThenBy(i => i.Name);
            else
                query = query.OrderBy(sortExpr).ThenBy(i => i.Name);
        }
        else
        {
            query = desc ? query.OrderByDescending(i => i.Name) : query.OrderBy(i => i.Name);
        }

        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(i => new
            {
                i.ItemId,
                i.Name,
                i.Category,
                i.Level,
                i.ItemLevel,
                i.Skill,
                i.StackSize,
                i.IconPath,
                IsRare = (i.Flags & 0x8000) != 0,
                IsExclusive = (i.Flags & 0x4000) != 0,
                IsNoAuction = (i.Flags & 0x0040) != 0,
                i.BaseSell,
                // Stats for table view
                i.Damage, i.Delay, i.DEF,
                i.HP, i.MP,
                i.STR, i.DEX, i.VIT, i.AGI, i.INT, i.MND, i.CHR,
                i.Accuracy, i.Attack,
                i.RangedAccuracy, i.RangedAttack,
                i.MagicAccuracy, i.MagicDamage, i.MagicEvasion,
                i.Evasion, i.Enmity, i.Haste,
                i.StoreTP, i.TPBonus,
                i.PhysicalDamageTaken, i.MagicDamageTaken,
            })
            .ToListAsync();

        return Ok(new { totalCount, page, pageSize, items });
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var item = await _db.GameItems.FindAsync(id);
        if (item is null) return NotFound();

        return Ok(new
        {
            item.ItemId,
            item.Name,
            item.NameJa,
            item.NameLong,
            item.Description,
            item.DescriptionJa,
            item.Category,
            item.Type,
            item.Flags,
            item.StackSize,
            item.Level,
            item.ItemLevel,
            item.Jobs,
            item.Races,
            item.Slots,
            item.Skill,
            item.Damage,
            item.Delay,
            item.DEF,
            item.HP, item.MP,
            item.STR, item.DEX, item.VIT, item.AGI, item.INT, item.MND, item.CHR,
            item.Accuracy, item.Attack,
            item.RangedAccuracy, item.RangedAttack,
            item.MagicAccuracy, item.MagicDamage, item.MagicEvasion,
            item.Evasion, item.Enmity, item.Haste,
            item.StoreTP, item.TPBonus,
            item.PhysicalDamageTaken, item.MagicDamageTaken,
            item.IconPath,
            item.PreviewImagePath,
            IsRare = item.IsRare,
            IsExclusive = item.IsExclusive,
            IsNoAuction = item.IsNoAuction,
            item.BaseSell,
        });
    }

    /// <summary>
    /// Get model ID mappings for a list of item IDs.
    /// Used by the 3D viewer to resolve which DAT files to load.
    /// </summary>
    [HttpGet("model-mappings")]
    public async Task<IActionResult> GetModelMappings([FromQuery] int[] itemIds)
    {
        if (itemIds.Length == 0 || itemIds.Length > 20)
            return BadRequest("Provide 1-20 item IDs");

        var mappings = await _db.ItemModelMappings
            .Where(m => itemIds.Contains(m.ItemId))
            .Select(m => new ModelMappingResponse
            {
                ItemId = m.ItemId,
                SlotId = m.SlotId,
                ModelId = m.ModelId
            })
            .ToListAsync();

        return Ok(mappings);
    }

    [HttpGet("random")]
    public async Task<IActionResult> Random([FromQuery] int count = 6)
    {
        if (count < 1 || count > 20) count = 6;

        // Spotlight: one random Weapon or Armor item
        var spotlight = await _db.GameItems
            .Where(i => i.Category == "Weapons" || i.Category == "Armor")
            .OrderBy(i => Guid.NewGuid())
            .Take(1)
            .Select(i => new
            {
                i.ItemId, i.Name, i.NameJa, i.NameLong,
                i.Description, i.DescriptionJa,
                i.Category, i.Type, i.Flags, i.StackSize,
                i.Level, i.ItemLevel, i.Jobs, i.Races, i.Slots, i.Skill,
                i.Damage, i.Delay, i.DEF,
                i.HP, i.MP,
                i.STR, i.DEX, i.VIT, i.AGI, i.INT, i.MND, i.CHR,
                i.Accuracy, i.Attack,
                i.RangedAccuracy, i.RangedAttack,
                i.MagicAccuracy, i.MagicDamage, i.MagicEvasion,
                i.Evasion, i.Enmity, i.Haste,
                i.StoreTP, i.TPBonus,
                i.PhysicalDamageTaken, i.MagicDamageTaken,
                i.IconPath, i.PreviewImagePath,
                IsRare = (i.Flags & 0x8000) != 0,
                IsExclusive = (i.Flags & 0x4000) != 0,
                IsNoAuction = (i.Flags & 0x0040) != 0,
            })
            .FirstOrDefaultAsync();

        // Supporting items: random from any category
        var supporting = await _db.GameItems
            .OrderBy(i => Guid.NewGuid())
            .Take(count - 1)
            .Select(i => new
            {
                i.ItemId, i.Name, i.NameJa, i.NameLong,
                i.Description, i.DescriptionJa,
                i.Category, i.Type, i.Flags, i.StackSize,
                i.Level, i.ItemLevel, i.Jobs, i.Races, i.Slots, i.Skill,
                i.Damage, i.Delay, i.DEF,
                i.HP, i.MP,
                i.STR, i.DEX, i.VIT, i.AGI, i.INT, i.MND, i.CHR,
                i.Accuracy, i.Attack,
                i.RangedAccuracy, i.RangedAttack,
                i.MagicAccuracy, i.MagicDamage, i.MagicEvasion,
                i.Evasion, i.Enmity, i.Haste,
                i.StoreTP, i.TPBonus,
                i.PhysicalDamageTaken, i.MagicDamageTaken,
                i.IconPath, i.PreviewImagePath,
                IsRare = (i.Flags & 0x8000) != 0,
                IsExclusive = (i.Flags & 0x4000) != 0,
                IsNoAuction = (i.Flags & 0x0040) != 0,
            })
            .ToListAsync();

        return Ok(new { spotlight, supporting });
    }

    [HttpGet("categories")]
    public async Task<IActionResult> Categories()
    {
        var categories = await _db.GameItems
            .Select(i => i.Category)
            .Distinct()
            .OrderBy(c => c)
            .ToListAsync();

        return Ok(categories);
    }

    [HttpGet("{id:int}/prices")]
    public async Task<IActionResult> Prices(
        int id,
        [FromQuery] string? server = null,
        [FromQuery] int days = 30,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25)
    {
        if (days > 365) days = 365;
        if (pageSize > 100) pageSize = 100;

        var itemExists = await _db.GameItems.AnyAsync(i => i.ItemId == id);
        if (!itemExists) return NotFound();

        var since = DateTimeOffset.UtcNow.AddDays(-days);
        var query = _db.AuctionSales
            .Where(s => s.ItemId == id && s.SoldAt >= since);

        if (!string.IsNullOrEmpty(server))
        {
            var srv = await _db.GameServers.FirstOrDefaultAsync(s => s.Name == server);
            if (srv is null) return BadRequest(new { message = $"Unknown server: {server}" });
            query = query.Where(s => s.ServerId == srv.Id);
        }

        var totalCount = await query.CountAsync();

        object? stats = null;
        double salesPerDay = 0;

        if (totalCount > 0)
        {
            var prices = query.Select(s => s.Price);
            var min = await prices.MinAsync();
            var max = await prices.MaxAsync();
            var avg = (int)await prices.AverageAsync();

            var sortedPrices = await query.OrderBy(s => s.Price).Select(s => s.Price).ToListAsync();
            var median = sortedPrices[sortedPrices.Count / 2];

            salesPerDay = days > 0 ? Math.Round((double)totalCount / days, 2) : 0;

            stats = new { Median = median, Min = min, Max = max, Average = avg, SalesPerDay = salesPerDay };
        }

        var sales = await query
            .OrderByDescending(s => s.SoldAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new
            {
                s.Price,
                s.SoldAt,
                s.SellerName,
                s.BuyerName,
                s.StackSize,
            })
            .ToListAsync();

        return Ok(new { totalCount, page, pageSize, days, stats, sales });
    }

    [HttpGet("{id:int}/prices/all")]
    public async Task<IActionResult> CrossServerPrices(int id, [FromQuery] int days = 30)
    {
        if (days > 365) days = 365;

        var itemExists = await _db.GameItems.AnyAsync(i => i.ItemId == id);
        if (!itemExists) return NotFound();

        var since = DateTimeOffset.UtcNow.AddDays(-days);

        var rawSales = await _db.AuctionSales
            .Where(s => s.ItemId == id && s.SoldAt >= since)
            .Select(s => new { ServerName = s.Server.Name, s.Price })
            .ToListAsync();

        var serverPrices = rawSales
            .GroupBy(s => s.ServerName)
            .Select(g =>
            {
                var sorted = g.OrderBy(s => s.Price).Select(s => s.Price).ToList();
                return new
                {
                    Server = g.Key,
                    Median = sorted[sorted.Count / 2],
                    Min = sorted[0],
                    Max = sorted[^1],
                    Average = (int)sorted.Average(),
                    SaleCount = sorted.Count,
                };
            })
            .OrderBy(s => s.Server)
            .ToList();

        return Ok(new { days, servers = serverPrices });
    }

    [HttpGet("{id:int}/bazaar")]
    public async Task<IActionResult> BazaarListings(
        int id,
        [FromQuery] string? server = null)
    {
        var itemExists = await _db.GameItems.AnyAsync(i => i.ItemId == id);
        if (!itemExists) return NotFound();

        var query = _db.BazaarListings
            .Where(l => l.ItemId == id && l.IsActive);

        if (!string.IsNullOrEmpty(server))
        {
            var srv = await _db.GameServers.FirstOrDefaultAsync(s => s.Name == server);
            if (srv is null) return BadRequest(new { message = $"Unknown server: {server}" });
            query = query.Where(l => l.ServerId == srv.Id);
        }

        var listings = await query
            .OrderBy(l => l.Price)
            .Select(l => new
            {
                l.SellerName,
                l.Price,
                l.Quantity,
                l.Zone,
                l.LastSeenAt,
                ServerName = l.Server.Name,
            })
            .ToListAsync();

        return Ok(listings);
    }

    [HttpGet("{id:int}/owners")]
    public async Task<IActionResult> GetItemOwners(int id)
    {
        // Characters who have this item equipped
        var equippedChars = await _db.EquippedGear
            .Where(g => g.ItemId == id)
            .Select(g => g.Character)
            .Where(c => c.IsPublic)
            .Distinct()
            .Select(c => new ItemOwnerEntry
            {
                Name = c.Name,
                Server = c.Server,
                Job = c.Jobs.Where(j => j.IsActive).Select(j => j.JobId.ToString()).FirstOrDefault(),
                Level = c.Jobs.Where(j => j.IsActive).Select(j => (int?)j.Level).FirstOrDefault(),
            })
            .OrderBy(e => e.Name)
            .ToListAsync();

        // For Rare/Ex items, also check inventory
        var inventoryChars = new List<ItemOwnerEntry>();
        var gameItem = await _db.GameItems.FindAsync(id);
        if (gameItem is { IsRare: true } or { IsExclusive: true })
        {
            var equippedNames = equippedChars.Select(e => e.Name + e.Server).ToHashSet();
            inventoryChars = await _db.CharacterInventories
                .Where(i => i.ItemId == id)
                .Select(i => i.Character)
                .Where(c => c.IsPublic)
                .Distinct()
                .Select(c => new ItemOwnerEntry
                {
                    Name = c.Name,
                    Server = c.Server,
                    Job = c.Jobs.Where(j => j.IsActive).Select(j => j.JobId.ToString()).FirstOrDefault(),
                    Level = c.Jobs.Where(j => j.IsActive).Select(j => (int?)j.Level).FirstOrDefault(),
                })
                .OrderBy(e => e.Name)
                .ToListAsync();

            // Remove characters already in the equipped list
            inventoryChars = inventoryChars
                .Where(i => !equippedNames.Contains(i.Name + i.Server))
                .ToList();
        }

        return Ok(new ItemOwnersResponse
        {
            Equipped = equippedChars,
            Inventory = inventoryChars,
        });
    }

    private static readonly Dictionary<string, Expression<Func<GameItem, int?>>> StatExpressions = new(StringComparer.OrdinalIgnoreCase)
    {
        ["HP"] = i => i.HP, ["MP"] = i => i.MP,
        ["STR"] = i => i.STR, ["DEX"] = i => i.DEX, ["VIT"] = i => i.VIT,
        ["AGI"] = i => i.AGI, ["INT"] = i => i.INT, ["MND"] = i => i.MND, ["CHR"] = i => i.CHR,
        ["Damage"] = i => i.Damage, ["Delay"] = i => i.Delay, ["DEF"] = i => i.DEF,
        ["Accuracy"] = i => i.Accuracy, ["Attack"] = i => i.Attack,
        ["RangedAccuracy"] = i => i.RangedAccuracy, ["RangedAttack"] = i => i.RangedAttack,
        ["MagicAccuracy"] = i => i.MagicAccuracy, ["MagicDamage"] = i => i.MagicDamage,
        ["MagicEvasion"] = i => i.MagicEvasion, ["Evasion"] = i => i.Evasion,
        ["Enmity"] = i => i.Enmity, ["Haste"] = i => i.Haste,
        ["StoreTP"] = i => i.StoreTP, ["TPBonus"] = i => i.TPBonus,
        ["PhysicalDamageTaken"] = i => i.PhysicalDamageTaken,
        ["MagicDamageTaken"] = i => i.MagicDamageTaken,
    };

    private static readonly Dictionary<string, int> SlotBitmasks = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Main"] = 0x0001, ["Sub"] = 0x0002, ["Range"] = 0x0004, ["Ammo"] = 0x0008,
        ["Head"] = 0x0010, ["Body"] = 0x0020, ["Hands"] = 0x0040, ["Legs"] = 0x0080,
        ["Feet"] = 0x0100, ["Neck"] = 0x0200, ["Waist"] = 0x0400,
        ["Ear"] = 0x1800,   // EarL (0x0800) | EarR (0x1000)
        ["Ring"] = 0x6000,  // RingL (0x2000) | RingR (0x4000)
        ["Back"] = 0x8000,
    };

    private static readonly Dictionary<string, int> FlagBitmasks = new(StringComparer.OrdinalIgnoreCase)
    {
        ["rare"] = 0x8000,
        ["exclusive"] = 0x4000,
        ["noauction"] = 0x0040,
        ["nosale"] = 0x1000,
        ["inscribable"] = 0x0020,
    };

    private static Expression<Func<GameItem, bool>> BuildStatFilter(
        Expression<Func<GameItem, int?>> statExpr, int? min, int? max)
    {
        var param = statExpr.Parameters[0];
        var body = statExpr.Body;
        Expression filter = Expression.NotEqual(body, Expression.Constant(null, typeof(int?)));
        if (min.HasValue)
            filter = Expression.AndAlso(filter,
                Expression.GreaterThanOrEqual(body, Expression.Constant((int?)min.Value, typeof(int?))));
        if (max.HasValue)
            filter = Expression.AndAlso(filter,
                Expression.LessThanOrEqual(body, Expression.Constant((int?)max.Value, typeof(int?))));
        return Expression.Lambda<Func<GameItem, bool>>(filter, param);
    }

    // FFXI job bitmask: bit 0 is unused (no job), WAR starts at bit 1.
    // This matches the actual Windower Resources items.lua bitmask values.
    private static int? GetJobBitmask(string jobAbbr)
    {
        return jobAbbr.ToUpperInvariant() switch
        {
            "WAR" => 1 << 1,
            "MNK" => 1 << 2,
            "WHM" => 1 << 3,
            "BLM" => 1 << 4,
            "RDM" => 1 << 5,
            "THF" => 1 << 6,
            "PLD" => 1 << 7,
            "DRK" => 1 << 8,
            "BST" => 1 << 9,
            "BRD" => 1 << 10,
            "RNG" => 1 << 11,
            "SAM" => 1 << 12,
            "NIN" => 1 << 13,
            "DRG" => 1 << 14,
            "SMN" => 1 << 15,
            "BLU" => 1 << 16,
            "COR" => 1 << 17,
            "PUP" => 1 << 18,
            "DNC" => 1 << 19,
            "SCH" => 1 << 20,
            "GEO" => 1 << 21,
            "RUN" => 1 << 22,
            _ => null,
        };
    }
}
