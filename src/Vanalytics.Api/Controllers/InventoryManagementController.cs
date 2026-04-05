using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.DTOs.Inventory;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/characters/{characterId:guid}/inventory")]
[Authorize]
public class InventoryManagementController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private const int MaxSlotsPerBag = 80;
    private const double NearCapacityThreshold = 0.90;

    public InventoryManagementController(VanalyticsDbContext db)
    {
        _db = db;
    }

    [HttpGet("anomalies")]
    public async Task<IActionResult> GetAnomalies(Guid characterId)
    {
        var userId = GetUserId();
        var character = await _db.Characters
            .Where(c => c.Id == characterId && c.UserId == userId)
            .FirstOrDefaultAsync();

        if (character is null) return NotFound();

        var inventory = await _db.CharacterInventories
            .Where(i => i.CharacterId == characterId)
            .Join(_db.GameItems,
                ci => ci.ItemId,
                gi => gi.ItemId,
                (ci, gi) => new InventorySlot(
                    ci.ItemId,
                    ci.Bag,
                    ci.SlotIndex,
                    ci.Quantity,
                    gi.Name ?? gi.NameJa ?? "Unknown",
                    gi.StackSize
                ))
            .ToListAsync();

        var dismissedKeys = await _db.DismissedAnomalies
            .Where(d => d.CharacterId == characterId)
            .Select(d => d.AnomalyKey)
            .ToListAsync();

        var dismissedSet = new HashSet<string>(dismissedKeys);

        // Item-level exclusions: "ignoreItem:{itemId}" keys mean skip all anomalies for that item
        var ignoredItemIds = dismissedKeys
            .Where(k => k.StartsWith("ignoreItem:"))
            .Select(k => int.TryParse(k.AsSpan("ignoreItem:".Length), out var id) ? id : -1)
            .Where(id => id >= 0)
            .ToHashSet();

        var pendingMoveItemIds = await _db.InventoryMoveOrders
            .Where(m => m.CharacterId == characterId && m.Status == MoveOrderStatus.Pending)
            .Select(m => m.ItemId)
            .Distinct()
            .ToListAsync();

        var pendingItemSet = new HashSet<int>(pendingMoveItemIds);

        var pendingMoves = await _db.InventoryMoveOrders
            .Where(m => m.CharacterId == characterId && m.Status == MoveOrderStatus.Pending)
            .Join(_db.GameItems, m => m.ItemId, g => g.ItemId, (m, g) => new MoveOrderResponse
            {
                Id = m.Id,
                ItemId = m.ItemId,
                ItemName = g.Name ?? g.NameJa ?? "Unknown",
                FromBag = m.FromBag.ToString(),
                FromSlot = m.FromSlot,
                ToBag = m.ToBag.ToString(),
                Quantity = m.Quantity,
                Status = m.Status.ToString(),
                CreatedAt = m.CreatedAt
            })
            .ToListAsync();

        var anomalies = new List<Anomaly>();

        var byItem = inventory.GroupBy(i => i.ItemId);

        foreach (var group in byItem)
        {
            var items = group.ToList();
            var itemId = group.Key;
            var itemName = items[0].ItemName;
            var stackSize = items[0].StackSize;
            var bags = items.Select(i => i.Bag.ToString()).Distinct().ToList();

            // Flag as duplicate if item exists in multiple bags, OR if stackable
            // item occupies more slots than necessary (partial stacks).
            var isMultiBag = bags.Count >= 2;
            var isPartialStack = false;
            if (stackSize > 1 && items.Count >= 2)
            {
                var totalQty = items.Sum(i => i.Quantity);
                var minSlots = (int)Math.Ceiling((double)totalQty / stackSize);
                isPartialStack = items.Count > minSlots;
            }

            if (isMultiBag || isPartialStack)
            {
                var key = $"duplicate:{itemId}";
                if (!dismissedSet.Contains(key) && !pendingItemSet.Contains(itemId) && !ignoredItemIds.Contains(itemId))
                {
                    var slots = items.Select(i => new SlotInfo
                    {
                        Bag = i.Bag.ToString(),
                        SlotIndex = i.SlotIndex,
                        Quantity = i.Quantity
                    }).ToList();

                    // Stack-aware consolidation planner:
                    // 1. Pick target bag (bag with the most total quantity)
                    // 2. Identify which slots in the target bag to keep (fill to stack max)
                    // 3. Generate moves to empty all other slots into the target bag
                    // 4. Each move specifies the exact quantity to move

                    var targetBagEnum = items
                        .GroupBy(i => i.Bag)
                        .OrderByDescending(g => g.Sum(x => x.Quantity))
                        .First().Key;
                    var targetBagName = targetBagEnum.ToString();

                    var moves = GenerateConsolidationMoves(items, targetBagEnum, targetBagName, itemId, stackSize);

                    anomalies.Add(new Anomaly
                    {
                        Type = "duplicate",
                        Severity = "warning",
                        AnomalyKey = key,
                        ItemId = itemId,
                        ItemName = itemName,
                        Bags = bags,
                        IsEquipment = stackSize == 1,
                        Details = new AnomalyDetails { Slots = slots },
                        SuggestedFix = moves.Count > 0 ? new SuggestedFix { Moves = moves } : null
                    });
                }
            }
        }

        var slotsByBag = inventory.GroupBy(i => i.Bag);
        foreach (var bagGroup in slotsByBag)
        {
            var usedSlots = bagGroup.Count();
            if ((double)usedSlots / MaxSlotsPerBag >= NearCapacityThreshold)
            {
                var bagName = bagGroup.Key.ToString();
                var key = $"nearCapacity:{bagName}";
                if (!dismissedSet.Contains(key))
                {
                    anomalies.Add(new Anomaly
                    {
                        Type = "nearCapacity",
                        Severity = "warning",
                        AnomalyKey = key,
                        Bags = [bagName],
                        Details = new AnomalyDetails
                        {
                            BagName = bagName,
                            UsedSlots = usedSlots,
                            MaxSlots = MaxSlotsPerBag
                        }
                    });
                }
            }
        }

        // Resolve item IDs in dismissed keys to friendly labels
        var dismissedItemIds = dismissedKeys
            .Select(k =>
            {
                var parts = k.Split(':');
                return parts.Length == 2 && int.TryParse(parts[1], out var id) ? id : -1;
            })
            .Where(id => id >= 0)
            .Distinct()
            .ToList();

        var itemNames = dismissedItemIds.Count > 0
            ? await _db.GameItems
                .Where(g => dismissedItemIds.Contains(g.ItemId))
                .ToDictionaryAsync(g => g.ItemId, g => g.Name ?? g.NameJa ?? "Unknown")
            : new Dictionary<int, string>();

        var dismissedEntries = dismissedKeys.Select(key =>
        {
            var parts = key.Split(':');
            var type = parts.Length >= 1 ? parts[0] : key;
            var value = parts.Length >= 2 ? parts[1] : "";

            var label = type switch
            {
                "duplicate" when int.TryParse(value, out var id) && itemNames.TryGetValue(id, out var name)
                    => $"Duplicate: {name}",
                "ignoreItem" when int.TryParse(value, out var id) && itemNames.TryGetValue(id, out var name)
                    => $"Always ignore: {name}",
                "nearCapacity" => $"Near capacity: {value}",
                _ => key
            };

            return new DismissedEntry { Key = key, Label = label };
        }).ToList();

        return Ok(new AnomalyResponse
        {
            Anomalies = anomalies,
            DismissedCount = dismissedKeys.Count,
            DismissedKeys = dismissedEntries,
            PendingMoves = pendingMoves
        });
    }

    [HttpPost("dismiss")]
    public async Task<IActionResult> Dismiss(Guid characterId, [FromBody] DismissRequest request)
    {
        var userId = GetUserId();
        var character = await _db.Characters
            .Where(c => c.Id == characterId && c.UserId == userId)
            .FirstOrDefaultAsync();

        if (character is null) return NotFound();

        var existing = await _db.DismissedAnomalies
            .FirstOrDefaultAsync(d => d.CharacterId == characterId && d.AnomalyKey == request.AnomalyKey);

        if (existing is not null)
            return Ok(new { message = "Already dismissed" });

        _db.DismissedAnomalies.Add(new DismissedAnomaly
        {
            CharacterId = characterId,
            AnomalyKey = request.AnomalyKey,
            DismissedAt = DateTimeOffset.UtcNow
        });

        await _db.SaveChangesAsync();
        return Ok(new { message = "Dismissed" });
    }

    [HttpDelete("dismiss/{anomalyKey}")]
    public async Task<IActionResult> Undismiss(Guid characterId, string anomalyKey)
    {
        var userId = GetUserId();
        var character = await _db.Characters
            .Where(c => c.Id == characterId && c.UserId == userId)
            .FirstOrDefaultAsync();

        if (character is null) return NotFound();

        var dismissed = await _db.DismissedAnomalies
            .FirstOrDefaultAsync(d => d.CharacterId == characterId && d.AnomalyKey == anomalyKey);

        if (dismissed is null) return NotFound();

        _db.DismissedAnomalies.Remove(dismissed);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Un-dismissed" });
    }

    [HttpPost("moves")]
    public async Task<IActionResult> CreateMoves(Guid characterId, [FromBody] CreateMovesRequest request)
    {
        var userId = GetUserId();
        var character = await _db.Characters
            .Where(c => c.Id == characterId && c.UserId == userId)
            .FirstOrDefaultAsync();

        if (character is null) return NotFound();

        var now = DateTimeOffset.UtcNow;

        foreach (var move in request.Moves)
        {
            if (!Enum.TryParse<InventoryBag>(move.FromBag, true, out var fromBag) ||
                !Enum.TryParse<InventoryBag>(move.ToBag, true, out var toBag))
                continue;

            _db.InventoryMoveOrders.Add(new InventoryMoveOrder
            {
                CharacterId = characterId,
                ItemId = move.ItemId,
                FromBag = fromBag,
                FromSlot = move.FromSlot,
                ToBag = toBag,
                Quantity = move.Quantity,
                Status = MoveOrderStatus.Pending,
                CreatedAt = now
            });
        }

        await _db.SaveChangesAsync();
        return Ok(new { message = "Move orders created" });
    }

    [HttpGet("moves")]
    public async Task<IActionResult> GetMoves(Guid characterId, [FromQuery] string? status)
    {
        var userId = GetUserId();
        var character = await _db.Characters
            .Where(c => c.Id == characterId && c.UserId == userId)
            .FirstOrDefaultAsync();

        if (character is null) return NotFound();

        var query = _db.InventoryMoveOrders
            .Where(m => m.CharacterId == characterId);

        if (!string.IsNullOrEmpty(status) && Enum.TryParse<MoveOrderStatus>(status, true, out var parsed))
            query = query.Where(m => m.Status == parsed);

        var moves = await query
            .OrderByDescending(m => m.CreatedAt)
            .Join(_db.GameItems, m => m.ItemId, g => g.ItemId, (m, g) => new MoveOrderResponse
            {
                Id = m.Id,
                ItemId = m.ItemId,
                ItemName = g.Name ?? g.NameJa ?? "Unknown",
                FromBag = m.FromBag.ToString(),
                FromSlot = m.FromSlot,
                ToBag = m.ToBag.ToString(),
                Quantity = m.Quantity,
                Status = m.Status.ToString(),
                CreatedAt = m.CreatedAt
            })
            .ToListAsync();

        return Ok(moves);
    }

    [HttpDelete("moves/{id:long}")]
    public async Task<IActionResult> CancelMove(Guid characterId, long id)
    {
        var userId = GetUserId();
        var character = await _db.Characters
            .Where(c => c.Id == characterId && c.UserId == userId)
            .FirstOrDefaultAsync();

        if (character is null) return NotFound();

        var move = await _db.InventoryMoveOrders
            .FirstOrDefaultAsync(m => m.Id == id && m.CharacterId == characterId);

        if (move is null) return NotFound();

        if (move.Status != MoveOrderStatus.Pending)
            return BadRequest(new { message = "Only pending moves can be cancelled" });

        move.Status = MoveOrderStatus.Cancelled;
        move.CompletedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { message = "Move cancelled" });
    }

    /// <summary>
    /// Generates an optimal set of move instructions to consolidate all instances
    /// of an item into the target bag using the minimum number of stack slots.
    ///
    /// Strategy:
    /// 1. Sort target bag slots by quantity descending (fill the fullest stacks first)
    /// 2. For each source slot NOT in the target bag (or excess slots within target bag):
    ///    - Calculate how much fits into existing target stacks
    ///    - Generate moves with exact quantities that won't overflow
    ///    - Remaining quantity goes to the target bag with auto-placement
    /// </summary>
    private static List<MoveInstruction> GenerateConsolidationMoves(
        List<InventorySlot> items, InventoryBag targetBagEnum, string targetBagName, int itemId, int stackSize)
    {
        var moves = new List<MoveInstruction>();

        // Separate items into target bag slots and source slots
        var sourceSlots = items
            .Where(i => i.Bag != targetBagEnum)
            .OrderBy(i => i.Quantity)
            .ToList();

        if (sourceSlots.Count == 0)
        {
            // All items are in the same bag — consolidate partial stacks within the bag.
            var totalQty = items.Sum(i => i.Quantity);
            var minSlots = (int)Math.Ceiling((double)totalQty / stackSize);

            if (items.Count <= minSlots)
                return moves; // Already optimal

            // Keep the slots with the most quantity, move the rest.
            // The addon uses auto-place (0x52) which will stack into existing slots.
            var slotsToKeep = items
                .OrderByDescending(i => i.Quantity)
                .Take(minSlots)
                .ToList();
            var keepSet = slotsToKeep.Select(s => s.SlotIndex).ToHashSet();

            foreach (var item in items)
            {
                if (!keepSet.Contains(item.SlotIndex))
                {
                    moves.Add(new MoveInstruction
                    {
                        ItemId = itemId,
                        FromBag = item.Bag.ToString(),
                        FromSlot = item.SlotIndex,
                        ToBag = targetBagName,
                        Quantity = item.Quantity
                    });
                }
            }

            return moves;
        }

        // Cross-bag consolidation: move all source slots to the target bag.
        // The addon handles stacking automatically (finds existing partial
        // stacks in the destination or auto-places if none have room).
        foreach (var source in sourceSlots)
        {
            moves.Add(new MoveInstruction
            {
                ItemId = itemId,
                FromBag = source.Bag.ToString(),
                FromSlot = source.SlotIndex,
                ToBag = targetBagName,
                Quantity = source.Quantity
            });
        }

        return moves;
    }

    private record InventorySlot(int ItemId, InventoryBag Bag, int SlotIndex, int Quantity, string ItemName, int StackSize);

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
