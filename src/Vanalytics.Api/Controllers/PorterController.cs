using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/sync/porter")]
[Authorize(AuthenticationSchemes = "ApiKey")]
public class PorterController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private readonly RateLimiter _rateLimiter;

    public PorterController(VanalyticsDbContext db, RateLimiter rateLimiter)
    {
        _db = db;
        _rateLimiter = rateLimiter;
    }

    [HttpPost]
    public async Task<IActionResult> SyncPorter([FromBody] PorterSyncRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded. Max 20 requests per hour." });

        var character = await _db.Characters
            .FirstOrDefaultAsync(c => c.Name == request.CharacterName && c.Server == request.Server);

        if (character is null)
            return NotFound(new { message = "Character not found. Run a full sync first." });

        if (character.UserId != userId)
            return StatusCode(403, new { message = "Character is not owned by this account" });

        var now = DateTimeOffset.UtcNow;
        var slipsProcessed = 0;
        var itemsProcessed = 0;

        // Per-slip authoritative replace: for each slip in the payload, wipe and rewrite
        // its items. Slips not in the payload are left alone (player wasn't carrying them).
        foreach (var slipEntry in request.Slips)
        {
            var existingSlip = await _db.CharacterPorterSlips
                .FirstOrDefaultAsync(s =>
                    s.CharacterId == character.Id &&
                    s.SlipItemId == slipEntry.SlipItemId);

            if (existingSlip is null)
            {
                _db.CharacterPorterSlips.Add(new CharacterPorterSlip
                {
                    CharacterId = character.Id,
                    SlipItemId = slipEntry.SlipItemId,
                    SlipNumber = slipEntry.SlipNumber,
                    SyncedAt = now,
                    UserHidden = false
                });
            }
            else
            {
                existingSlip.SlipNumber = slipEntry.SlipNumber;
                existingSlip.SyncedAt = now;
                existingSlip.UserHidden = false;
            }

            var existingItems = await _db.CharacterPorterItems
                .Where(p => p.CharacterId == character.Id && p.SlipItemId == slipEntry.SlipItemId)
                .ToListAsync();
            _db.CharacterPorterItems.RemoveRange(existingItems);

            // Dedupe item IDs within a slip — extdata is a bitmap so each item appears once,
            // but a malformed client could send duplicates. Unique index would throw otherwise.
            foreach (var itemId in slipEntry.ItemIds.Distinct())
            {
                _db.CharacterPorterItems.Add(new CharacterPorterItem
                {
                    CharacterId = character.Id,
                    SlipItemId = slipEntry.SlipItemId,
                    SlipNumber = slipEntry.SlipNumber,
                    ItemId = itemId,
                    LastSeenAt = now
                });
                itemsProcessed++;
            }

            slipsProcessed++;
        }

        await _db.SaveChangesAsync();

        return Ok(new { message = "Porter sync successful", slipsProcessed, itemsProcessed });
    }
}
