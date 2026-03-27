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
                (ci, gi) => new
                {
                    ci.ItemId,
                    ci.Bag,
                    ci.SlotIndex,
                    ci.Quantity,
                    ItemName = gi.Name ?? gi.NameJa ?? "Unknown",
                    gi.StackSize
                })
            .ToListAsync();

        var dismissedKeys = await _db.DismissedAnomalies
            .Where(d => d.CharacterId == characterId)
            .Select(d => d.AnomalyKey)
            .ToListAsync();

        var dismissedSet = new HashSet<string>(dismissedKeys);

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

            if (bags.Count >= 2)
            {
                var key = $"duplicate:{itemId}";
                if (!dismissedSet.Contains(key) && !pendingItemSet.Contains(itemId))
                {
                    var slots = items.Select(i => new SlotInfo
                    {
                        Bag = i.Bag.ToString(),
                        SlotIndex = i.SlotIndex,
                        Quantity = i.Quantity
                    }).ToList();

                    var targetBag = items
                        .GroupBy(i => i.Bag)
                        .OrderByDescending(g => g.Sum(x => x.Quantity))
                        .First().Key;

                    var moves = items
                        .Where(i => i.Bag != targetBag)
                        .Select(i => new MoveInstruction
                        {
                            ItemId = itemId,
                            FromBag = i.Bag.ToString(),
                            FromSlot = i.SlotIndex,
                            ToBag = targetBag.ToString(),
                            Quantity = i.Quantity
                        }).ToList();

                    anomalies.Add(new Anomaly
                    {
                        Type = "duplicate",
                        Severity = "warning",
                        AnomalyKey = key,
                        ItemId = itemId,
                        ItemName = itemName,
                        Bags = bags,
                        Details = new AnomalyDetails { Slots = slots },
                        SuggestedFix = moves.Count > 0 ? new SuggestedFix { Moves = moves } : null
                    });
                }
            }

            if (stackSize > 1 && items.Count >= 2)
            {
                var totalQty = items.Sum(i => i.Quantity);
                var minSlots = (int)Math.Ceiling((double)totalQty / stackSize);

                if (items.Count > minSlots)
                {
                    var key = $"splitStack:{itemId}";
                    if (!dismissedSet.Contains(key) && !pendingItemSet.Contains(itemId))
                    {
                        var slots = items.Select(i => new SlotInfo
                        {
                            Bag = i.Bag.ToString(),
                            SlotIndex = i.SlotIndex,
                            Quantity = i.Quantity
                        }).ToList();

                        var targetSlot = items.OrderByDescending(i => i.Quantity).First();
                        var moves = items
                            .Where(i => !(i.Bag == targetSlot.Bag && i.SlotIndex == targetSlot.SlotIndex))
                            .Select(i => new MoveInstruction
                            {
                                ItemId = itemId,
                                FromBag = i.Bag.ToString(),
                                FromSlot = i.SlotIndex,
                                ToBag = targetSlot.Bag.ToString(),
                                Quantity = i.Quantity
                            }).ToList();

                        anomalies.Add(new Anomaly
                        {
                            Type = "splitStack",
                            Severity = "info",
                            AnomalyKey = key,
                            ItemId = itemId,
                            ItemName = itemName,
                            Bags = bags,
                            Details = new AnomalyDetails { Slots = slots },
                            SuggestedFix = moves.Count > 0 ? new SuggestedFix { Moves = moves } : null
                        });
                    }
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

        return Ok(new AnomalyResponse
        {
            Anomalies = anomalies,
            DismissedCount = dismissedKeys.Count,
            DismissedKeys = dismissedKeys,
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

    private Guid GetUserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
