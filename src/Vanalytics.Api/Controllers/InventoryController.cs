using System.Security.Claims;
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
[Route("api/sync/inventory")]
[Authorize(AuthenticationSchemes = "ApiKey")]
public class InventoryController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private readonly RateLimiter _rateLimiter;

    public InventoryController(VanalyticsDbContext db, RateLimiter rateLimiter)
    {
        _db = db;
        _rateLimiter = rateLimiter;
    }

    [HttpPost]
    public async Task<IActionResult> SyncInventory([FromBody] InventorySyncRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        // Rate limit per API key (shares 20 req/hr budget with SyncController)
        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded. Max 20 requests per hour." });

        // Find character by name/server
        var character = await _db.Characters
            .FirstOrDefaultAsync(c => c.Name == request.CharacterName && c.Server == request.Server);

        if (character is null)
            return NotFound(new { message = "Character not found. Run a full sync first." });

        // Verify ownership
        if (character.UserId != userId)
            return StatusCode(403, new { message = "Character is not owned by this account" });

        // Full sync: wipe existing inventory records and start fresh.
        // Must SaveChanges before processing adds so EF's change tracker
        // doesn't conflict (same entity marked Deleted then Modified).
        if (request.FullSync)
        {
            await _db.CharacterInventories
                .Where(ci => ci.CharacterId == character.Id)
                .ExecuteDeleteAsync();
        }

        // Preload all existing inventory rows in a single query and index by
        // (ItemId, Bag, SlotIndex) so the per-change lookup is in-memory.
        // After a full-sync wipe this dictionary is empty, which is correct.
        var existingByKey = await _db.CharacterInventories
            .Where(ci => ci.CharacterId == character.Id)
            .ToDictionaryAsync(ci => (ci.ItemId, ci.Bag, ci.SlotIndex));

        var processed = 0;
        var now = DateTimeOffset.UtcNow;

        foreach (var change in request.Changes)
        {
            // Parse enums, skip invalid entries
            if (!Enum.TryParse<InventoryBag>(change.Bag, true, out var bag))
                continue;
            if (!Enum.TryParse<InventoryChangeType>(change.ChangeType, true, out var changeType))
                continue;

            // Always record the history entry
            _db.InventoryChanges.Add(new InventoryChange
            {
                CharacterId = character.Id,
                ItemId = change.ItemId,
                Bag = bag,
                SlotIndex = change.SlotIndex,
                ChangeType = changeType,
                QuantityBefore = change.QuantityBefore,
                QuantityAfter = change.QuantityAfter,
                ChangedAt = now
            });

            var key = (change.ItemId, bag, change.SlotIndex);
            existingByKey.TryGetValue(key, out var existing);

            switch (changeType)
            {
                case InventoryChangeType.Added:
                    if (existing is not null)
                    {
                        existing.Quantity = change.QuantityAfter;
                        existing.LastSeenAt = now;
                    }
                    else
                    {
                        var added = new CharacterInventory
                        {
                            CharacterId = character.Id,
                            ItemId = change.ItemId,
                            Bag = bag,
                            SlotIndex = change.SlotIndex,
                            Quantity = change.QuantityAfter,
                            LastSeenAt = now
                        };
                        _db.CharacterInventories.Add(added);
                        existingByKey[key] = added;
                    }
                    break;

                case InventoryChangeType.QuantityChanged:
                    if (existing is not null)
                    {
                        existing.Quantity = change.QuantityAfter;
                        existing.LastSeenAt = now;
                    }
                    break;

                case InventoryChangeType.Removed:
                    if (existing is not null)
                    {
                        _db.CharacterInventories.Remove(existing);
                        existingByKey.Remove(key);
                    }
                    break;
            }

            processed++;
        }

        await _db.SaveChangesAsync();

        return Ok(new { message = "Inventory sync successful", processed });
    }
}
