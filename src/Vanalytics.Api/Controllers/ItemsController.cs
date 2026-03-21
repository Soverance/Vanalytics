using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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

        var totalCount = await query.CountAsync();

        var items = await query
            .OrderBy(i => i.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(i => new
            {
                i.ItemId,
                i.Name,
                i.Category,
                i.Level,
                i.Skill,
                i.StackSize,
                i.IconPath,
                IsRare = (i.Flags & 32) != 0,
                IsExclusive = (i.Flags & 8192) != 0,
                IsAuctionable = (i.Flags & 32768) != 0,
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
            IsAuctionable = item.IsAuctionable,
        });
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
