using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/admin/items")]
[Authorize(Roles = "Admin")]
public class AdminItemsController : ControllerBase
{
    private readonly VanalyticsDbContext _db;

    public AdminItemsController(VanalyticsDbContext db)
    {
        _db = db;
    }

    [HttpGet("stats")]
    public async Task<IActionResult> Stats()
    {
        var totalItems = await _db.GameItems.CountAsync();
        var withIcons = await _db.GameItems.CountAsync(i => i.IconPath != null);
        var withDescriptions = await _db.GameItems.CountAsync(i => i.Description != null);

        var categories = await _db.GameItems
            .GroupBy(i => i.Category)
            .Select(g => new { Category = g.Key, Count = g.Count() })
            .OrderByDescending(g => g.Count)
            .ToListAsync();

        var totalAhSales = await _db.AuctionSales.LongCountAsync();
        var totalBazaarListings = await _db.BazaarListings.CountAsync();
        var activeBazaarListings = await _db.BazaarListings.CountAsync(l => l.IsActive);
        var activeBazaarPresences = await _db.BazaarPresences.CountAsync(p => p.IsActive);

        // Model mapping stats
        var totalModelMappings = await _db.ItemModelMappings.CountAsync();
        var modelMappingSlots = await _db.ItemModelMappings
            .GroupBy(m => m.SlotId)
            .Select(g => new { SlotId = g.Key, Count = g.Count() })
            .OrderBy(g => g.SlotId)
            .ToListAsync();
        var itemsWithModels = await _db.ItemModelMappings
            .Select(m => m.ItemId)
            .Distinct()
            .CountAsync();

        // NPC pool stats
        var totalNpcPools = await _db.NpcPools.CountAsync();
        var monsterPools = await _db.NpcPools.CountAsync(n => n.IsMonster);
        var humanoidPools = totalNpcPools - monsterPools;
        var npcFamilies = await _db.NpcPools
            .Select(n => n.FamilyId)
            .Distinct()
            .CountAsync();

        // Character stats
        var totalCharacters = await _db.Characters.CountAsync();
        var charactersWithRace = await _db.Characters.CountAsync(c => c.Race != null);
        var totalServers = await _db.GameServers.CountAsync();

        return Ok(new
        {
            items = new
            {
                total = totalItems,
                withIcons,
                withDescriptions,
                missingIcons = totalItems - withIcons,
                iconCoverage = totalItems > 0 ? Math.Round((double)withIcons / totalItems * 100, 1) : 0,
                categories,
            },
            modelMappings = new
            {
                total = totalModelMappings,
                itemsWithModels,
                slots = modelMappingSlots,
            },
            npcPools = new
            {
                total = totalNpcPools,
                monsters = monsterPools,
                humanoids = humanoidPools,
                families = npcFamilies,
            },
            characters = new
            {
                total = totalCharacters,
                withRace = charactersWithRace,
            },
            servers = new
            {
                total = totalServers,
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
