using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services;
using Vanalytics.Core.DTOs.Inventory;
using Vanalytics.Core.Inventory;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/characters/inventory")]
[Authorize]
public class AggregateInventoryController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    public AggregateInventoryController(VanalyticsDbContext db)
    {
        _db = db;
    }

    [HttpGet("aggregate")]
    public async Task<IActionResult> GetAggregate([FromQuery] string? world)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var allChars = await _db.Characters
            .Where(c => c.UserId == userId)
            .Select(c => new { c.Id, c.Name, c.Role, c.LastSyncAt, c.BagCapacitiesJson, c.Server })
            .ToListAsync();

        var availableWorlds = allChars.Select(c => c.Server).Distinct().OrderBy(s => s).ToList();

        // Resolve the world: query value > user default > most-populated world.
        string? resolvedWorld = null;
        if (availableWorlds.Count > 0)
        {
            if (world != null && availableWorlds.Contains(world))
            {
                resolvedWorld = world;
            }
            else
            {
                var defaultServer = await _db.Users
                    .Where(u => u.Id == userId).Select(u => u.DefaultServer).FirstOrDefaultAsync();
                resolvedWorld = defaultServer != null && availableWorlds.Contains(defaultServer)
                    ? defaultServer
                    : allChars.GroupBy(c => c.Server).OrderByDescending(g => g.Count()).First().Key;
            }
        }

        var characters = resolvedWorld is null
            ? allChars.Take(0).ToList()
            : allChars.Where(c => c.Server == resolvedWorld).ToList();
        var characterIds = characters.Select(c => c.Id).ToList();

        // Selected world's AH availability.
        var server = resolvedWorld is null
            ? null
            : await _db.GameServers.FirstOrDefaultAsync(s => s.Name == resolvedWorld);
        var serverScraped = server != null;

        var rows = await _db.CharacterInventories
            .Where(ci => characterIds.Contains(ci.CharacterId))
            .Join(_db.GameItems,
                ci => ci.ItemId,
                gi => gi.ItemId,
                (ci, gi) => new
                {
                    ci.CharacterId,
                    ci.ItemId,
                    Bag = ci.Bag,
                    ci.Quantity,
                    ItemName = gi.Name ?? gi.NameJa ?? "Unknown",
                    gi.IconPath,
                    gi.StackSize,
                    gi.BaseSell,
                    Flags = gi.Flags
                })
            .ToListAsync();

        var charById = characters.ToDictionary(c => c.Id);

        // AH medians for the world's held items (empty if the world isn't scraped).
        var itemIds = rows.Select(r => r.ItemId).Distinct().ToList();
        var medians = serverScraped
            ? await AhMedianService.GetMediansAsync(_db, server!.Id, itemIds)
            : new Dictionary<int, AhMedians>();

        var items = rows
            .GroupBy(r => r.ItemId)
            .Select(g =>
            {
                var first = g.First();
                medians.TryGetValue(g.Key, out var m);
                var flags = first.Flags;
                return new AggregateInventoryItem
                {
                    ItemId = g.Key,
                    Name = first.ItemName,
                    IconPath = first.IconPath,
                    StackSize = first.StackSize,
                    TotalQuantity = g.Sum(r => (long)r.Quantity),
                    IsRare = (flags & 0x8000) != 0,
                    IsExclusive = (flags & 0x4000) != 0,
                    IsNoDelivery = (flags & 0x2000) != 0,
                    IsNoAuction = (flags & 0x0040) != 0,
                    BaseSell = first.BaseSell,
                    SingleMedian = m?.SingleMedian,
                    SingleCount = m?.SingleCount ?? 0,
                    StackMedian = m?.StackMedian,
                    StackCount = m?.StackCount ?? 0,
                    LastSoldAt = m?.LastSoldAt,
                    Locations = g
                        .GroupBy(r => new { r.CharacterId, r.Bag })
                        .Select(bg => new AggregateInventoryLocation
                        {
                            CharacterId = bg.Key.CharacterId,
                            CharacterName = charById[bg.Key.CharacterId].Name,
                            Role = charById[bg.Key.CharacterId].Role.ToString(),
                            Bag = bg.Key.Bag.ToString(),
                            Quantity = bg.Sum(r => r.Quantity)
                        })
                        .OrderBy(l => l.CharacterName)
                        .ThenBy(l => l.Bag)
                        .ToList()
                };
            })
            .OrderBy(i => i.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var unlockedSlots = 0;
        foreach (var c in characters)
        {
            var caps = c.BagCapacitiesJson is not null
                ? JsonSerializer.Deserialize<Dictionary<string, int>>(c.BagCapacitiesJson) ?? new()
                : new Dictionary<string, int>();
            var activeBags = rows.Where(r => r.CharacterId == c.Id).Select(r => r.Bag.ToString()).Distinct();
            foreach (var bag in activeBags)
                unlockedSlots += BagCapacity.CapOf(caps, bag);
        }

        var response = new AggregateInventoryResponse
        {
            World = resolvedWorld,
            ServerScraped = serverScraped,
            AvailableWorlds = availableWorlds,
            Totals = new AggregateInventoryTotals
            {
                CharacterCount = characters.Count,
                SyncedCharacterCount = rows.Select(r => r.CharacterId).Distinct().Count(),
                DistinctItems = items.Count,
                TotalQuantity = rows.Sum(r => (long)r.Quantity),
                UsedSlots = rows.Count,
                UnlockedSlots = unlockedSlots
            },
            Items = items,
            Characters = characters
                .OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
                .Select(c => new AggregateInventoryCharacter
                {
                    CharacterId = c.Id,
                    Name = c.Name,
                    Role = c.Role.ToString(),
                    LastSyncAt = c.LastSyncAt
                })
                .ToList()
        };

        return Ok(response);
    }
}
