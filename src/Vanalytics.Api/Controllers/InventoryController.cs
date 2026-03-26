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

        var processed = 0;

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
                ChangedAt = DateTimeOffset.UtcNow
            });

            // Look up existing inventory record
            var existing = await _db.CharacterInventories
                .FirstOrDefaultAsync(ci =>
                    ci.CharacterId == character.Id &&
                    ci.ItemId == change.ItemId &&
                    ci.Bag == bag &&
                    ci.SlotIndex == change.SlotIndex);

            switch (changeType)
            {
                case InventoryChangeType.Added:
                    if (existing is not null)
                    {
                        existing.Quantity = change.QuantityAfter;
                        existing.LastSeenAt = DateTimeOffset.UtcNow;
                    }
                    else
                    {
                        _db.CharacterInventories.Add(new CharacterInventory
                        {
                            CharacterId = character.Id,
                            ItemId = change.ItemId,
                            Bag = bag,
                            SlotIndex = change.SlotIndex,
                            Quantity = change.QuantityAfter,
                            LastSeenAt = DateTimeOffset.UtcNow
                        });
                    }
                    break;

                case InventoryChangeType.QuantityChanged:
                    if (existing is not null)
                    {
                        existing.Quantity = change.QuantityAfter;
                        existing.LastSeenAt = DateTimeOffset.UtcNow;
                    }
                    break;

                case InventoryChangeType.Removed:
                    if (existing is not null)
                    {
                        _db.CharacterInventories.Remove(existing);
                    }
                    break;
            }

            processed++;
        }

        await _db.SaveChangesAsync();

        return Ok(new { message = "Inventory sync successful", processed });
    }
}
