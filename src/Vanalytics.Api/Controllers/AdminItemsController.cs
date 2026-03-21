using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/admin/items")]
[Authorize(Roles = "Admin")]
public class AdminItemsController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private readonly IItemImageStore _imageStore;

    public AdminItemsController(VanalyticsDbContext db, IItemImageStore imageStore)
    {
        _db = db;
        _imageStore = imageStore;
    }

    [HttpGet("stats")]
    public async Task<IActionResult> Stats()
    {
        var totalItems = await _db.GameItems.CountAsync();
        var withIconsInDb = await _db.GameItems.CountAsync(i => i.IconPath != null);
        var withPreviews = await _db.GameItems.CountAsync(i => i.PreviewImagePath != null);
        var withDescriptions = await _db.GameItems.CountAsync(i => i.Description != null);

        // Check how many icons actually exist in the store (disk or blob)
        var allItemIds = await _db.GameItems.Select(i => i.ItemId).ToListAsync();
        var withIcons = allItemIds.Count(id => _imageStore.IconExists(id));

        var categories = await _db.GameItems
            .GroupBy(i => i.Category)
            .Select(g => new { Category = g.Key, Count = g.Count() })
            .OrderByDescending(g => g.Count)
            .ToListAsync();

        var totalAhSales = await _db.AuctionSales.LongCountAsync();
        var totalBazaarListings = await _db.BazaarListings.CountAsync();
        var activeBazaarListings = await _db.BazaarListings.CountAsync(l => l.IsActive);
        var activeBazaarPresences = await _db.BazaarPresences.CountAsync(p => p.IsActive);

        return Ok(new
        {
            items = new
            {
                total = totalItems,
                withIcons,
                withPreviews,
                withDescriptions,
                missingIcons = totalItems - withIcons,
                missingPreviews = totalItems - withPreviews,
                iconCoverage = totalItems > 0 ? Math.Round((double)withIcons / totalItems * 100, 1) : 0,
                categories,
            },
            economy = new
            {
                totalAhSales,
                totalBazaarListings,
                activeBazaarListings,
                activeBazaarPresences,
            },
        });
    }
}
