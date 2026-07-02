using Microsoft.EntityFrameworkCore;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Services.Economy;

/// <summary>
/// Resolves the set of worlds the AH scraper is actively scraping:
/// master switch on AND per-world ScrapeEnabled AND a search endpoint is set.
/// Single source of truth for "enabled world" across economy read endpoints.
/// </summary>
public static class EnabledServerQuery
{
    public static async Task<List<GameServer>> GetEnabledAsync(VanalyticsDbContext db, CancellationToken ct = default)
    {
        var master = await db.ScraperSettings.AsNoTracking().FirstOrDefaultAsync(s => s.Id == 1, ct);
        if (master?.MasterEnabled != true) return new List<GameServer>();

        return await db.GameServers.AsNoTracking()
            .Where(s => s.ScrapeEnabled && s.SearchHost != null && s.SearchPort != null)
            .OrderBy(s => s.Name)
            .ToListAsync(ct);
    }
}
