using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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
    public async Task<IActionResult> GetAggregate()
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        // Roster meta (id, name, role, freshness, capacities).
        var characters = await _db.Characters
            .Where(c => c.UserId == userId)
            .Select(c => new
            {
                c.Id,
                c.Name,
                c.Role,
                c.LastSyncAt,
                c.BagCapacitiesJson
            })
            .ToListAsync();

        var characterIds = characters.Select(c => c.Id).ToList();

        // Flat join of every inventory row across the roster (no AsSplitQuery needed).
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
                    gi.StackSize
                })
            .ToListAsync();

        var charById = characters.ToDictionary(c => c.Id);

        // Group by item → per-item totals + per-location breakdown.
        var items = rows
            .GroupBy(r => r.ItemId)
            .Select(g =>
            {
                var first = g.First();
                return new AggregateInventoryItem
                {
                    ItemId = g.Key,
                    Name = first.ItemName,
                    IconPath = first.IconPath,
                    StackSize = first.StackSize,
                    TotalQuantity = g.Sum(r => (long)r.Quantity),
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

        // unlockedSlots: per character, sum CapOf over the bags that character
        // actually has items in (active bags) — matches per-character InventoryTotals.
        var unlockedSlots = 0;
        foreach (var c in characters)
        {
            var caps = c.BagCapacitiesJson is not null
                ? JsonSerializer.Deserialize<Dictionary<string, int>>(c.BagCapacitiesJson) ?? new()
                : new Dictionary<string, int>();

            var activeBags = rows
                .Where(r => r.CharacterId == c.Id)
                .Select(r => r.Bag.ToString())
                .Distinct();

            foreach (var bag in activeBags)
                unlockedSlots += BagCapacity.CapOf(caps, bag);
        }

        var syncedCharacterIds = rows.Select(r => r.CharacterId).Distinct().Count();

        var response = new AggregateInventoryResponse
        {
            Totals = new AggregateInventoryTotals
            {
                CharacterCount = characters.Count,
                SyncedCharacterCount = syncedCharacterIds,
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
