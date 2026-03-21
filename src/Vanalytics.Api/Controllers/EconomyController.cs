using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services;
using Vanalytics.Core.DTOs.Economy;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/economy")]
public class EconomyController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private readonly EconomyRateLimiter _rateLimiter;

    public EconomyController(VanalyticsDbContext db, EconomyRateLimiter rateLimiter)
    {
        _db = db;
        _rateLimiter = rateLimiter;
    }

    [HttpPost("ah")]
    [Authorize(AuthenticationSchemes = "ApiKey")]
    public async Task<IActionResult> IngestAh([FromBody] AhIngestionRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded. Max 120 requests per hour." });

        var server = await _db.GameServers.FirstOrDefaultAsync(s => s.Name == request.Server);
        if (server is null)
            return BadRequest(new { message = $"Unknown server: {request.Server}" });

        var itemExists = await _db.GameItems.AnyAsync(i => i.ItemId == request.ItemId);
        if (!itemExists)
            return BadRequest(new { message = $"Unknown item ID: {request.ItemId}" });

        var now = DateTimeOffset.UtcNow;
        var accepted = 0;
        var duplicates = 0;

        // Batch dedup: preload existing matching records in one query
        var saleDates = request.Sales.Select(s => s.SoldAt).Distinct().ToList();
        var existingSales = await _db.AuctionSales
            .Where(s => s.ItemId == request.ItemId && s.ServerId == server.Id)
            .Where(s => saleDates.Contains(s.SoldAt))
            .Select(s => new { s.Price, s.SoldAt, s.BuyerName, s.SellerName, s.StackSize })
            .ToListAsync();

        var existingSet = new HashSet<string>(
            existingSales.Select(s => $"{s.Price}|{s.SoldAt:O}|{s.BuyerName}|{s.SellerName}|{s.StackSize}"));

        foreach (var sale in request.Sales)
        {
            var key = $"{sale.Price}|{sale.SoldAt:O}|{sale.BuyerName}|{sale.SellerName}|{sale.StackSize}";
            if (existingSet.Contains(key))
            {
                duplicates++;
                continue;
            }

            _db.AuctionSales.Add(new AuctionSale
            {
                ItemId = request.ItemId,
                ServerId = server.Id,
                Price = sale.Price,
                SoldAt = sale.SoldAt,
                SellerName = sale.SellerName,
                BuyerName = sale.BuyerName,
                StackSize = sale.StackSize,
                ReportedByUserId = userId,
                ReportedAt = now,
            });

            accepted++;
        }

        if (accepted > 0)
            await _db.SaveChangesAsync();

        return Ok(new AhIngestionResponse { Accepted = accepted, Duplicates = duplicates });
    }

    [HttpPost("bazaar/presence")]
    [Authorize(AuthenticationSchemes = "ApiKey")]
    public async Task<IActionResult> IngestBazaarPresence([FromBody] BazaarPresenceRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded. Max 120 requests per hour." });

        var server = await _db.GameServers.FirstOrDefaultAsync(s => s.Name == request.Server);
        if (server is null)
            return BadRequest(new { message = $"Unknown server: {request.Server}" });

        var now = DateTimeOffset.UtcNow;
        var updated = 0;
        var created = 0;

        foreach (var player in request.Players)
        {
            var existing = await _db.BazaarPresences
                .FirstOrDefaultAsync(p => p.PlayerName == player.Name && p.ServerId == server.Id && p.IsActive);

            if (existing is not null)
            {
                existing.LastSeenAt = now;
                existing.Zone = request.Zone;
                updated++;
            }
            else
            {
                _db.BazaarPresences.Add(new BazaarPresence
                {
                    ServerId = server.Id,
                    PlayerName = player.Name,
                    Zone = request.Zone,
                    IsActive = true,
                    FirstSeenAt = now,
                    LastSeenAt = now,
                    ReportedByUserId = userId,
                });
                created++;
            }
        }

        await _db.SaveChangesAsync();
        return Ok(new { created, updated });
    }

    [HttpPost("bazaar")]
    [Authorize(AuthenticationSchemes = "ApiKey")]
    public async Task<IActionResult> IngestBazaarContents([FromBody] BazaarContentsRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var apiKey = Request.Headers["X-Api-Key"].ToString();
        if (!_rateLimiter.IsAllowed(apiKey))
            return StatusCode(429, new { message = "Rate limit exceeded. Max 120 requests per hour." });

        var server = await _db.GameServers.FirstOrDefaultAsync(s => s.Name == request.Server);
        if (server is null)
            return BadRequest(new { message = $"Unknown server: {request.Server}" });

        var now = DateTimeOffset.UtcNow;

        // Get current active listings for this seller
        var activeListings = await _db.BazaarListings
            .Where(l => l.SellerName == request.SellerName && l.ServerId == server.Id && l.IsActive)
            .ToListAsync();

        var seenItemKeys = new HashSet<string>();

        foreach (var item in request.Items)
        {
            var key = $"{item.ItemId}|{item.Price}";
            seenItemKeys.Add(key);

            var existing = activeListings
                .FirstOrDefault(l => l.ItemId == item.ItemId && l.Price == item.Price);

            if (existing is not null)
            {
                existing.LastSeenAt = now;
                existing.Quantity = item.Quantity;
                existing.Zone = request.Zone;
            }
            else
            {
                _db.BazaarListings.Add(new BazaarListing
                {
                    ItemId = item.ItemId,
                    ServerId = server.Id,
                    SellerName = request.SellerName,
                    Price = item.Price,
                    Quantity = item.Quantity,
                    Zone = request.Zone,
                    IsActive = true,
                    FirstSeenAt = now,
                    LastSeenAt = now,
                    ReportedByUserId = userId,
                });
            }
        }

        // Mark listings not in current scan as inactive
        foreach (var listing in activeListings)
        {
            var key = $"{listing.ItemId}|{listing.Price}";
            if (!seenItemKeys.Contains(key))
                listing.IsActive = false;
        }

        await _db.SaveChangesAsync();
        return Ok(new { message = "Bazaar contents updated" });
    }

    [HttpGet("bazaar/active")]
    public async Task<IActionResult> GetActiveBazaars(
        [FromQuery] string? server = null,
        [FromQuery] string? zone = null)
    {
        var query = _db.BazaarPresences
            .Where(p => p.IsActive);

        if (!string.IsNullOrEmpty(server))
        {
            var srv = await _db.GameServers.FirstOrDefaultAsync(s => s.Name == server);
            if (srv is null) return BadRequest(new { message = $"Unknown server: {server}" });
            query = query.Where(p => p.ServerId == srv.Id);
        }

        if (!string.IsNullOrEmpty(zone))
            query = query.Where(p => p.Zone == zone);

        var presences = await query
            .OrderBy(p => p.Zone)
            .ThenBy(p => p.PlayerName)
            .Select(p => new
            {
                p.PlayerName,
                p.Zone,
                ServerName = p.Server.Name,
                p.LastSeenAt,
            })
            .ToListAsync();

        var grouped = presences
            .GroupBy(p => p.Zone)
            .Select(g => new
            {
                Zone = g.Key,
                PlayerCount = g.Count(),
                Players = g.Select(p => new { p.PlayerName, p.LastSeenAt }).ToList(),
            })
            .ToList();

        return Ok(grouped);
    }
}
