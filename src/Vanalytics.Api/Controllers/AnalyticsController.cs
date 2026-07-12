using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Vanalytics.Api.Services;
using Vanalytics.Core.DTOs.Analytics;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

// NOTE: Analytics endpoints intentionally do NOT filter Character.IsPublic. Output is
// nameless aggregates over the entire synced playerbase. Do not add IsPublic filters here.
[ApiController]
[Route("api/analytics")]
public class AnalyticsController(VanalyticsDbContext db, AnalyticsService analytics, IMemoryCache cache) : ControllerBase
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(30);

    private Task<T> Cached<T>(string key, Func<Task<T>> factory) =>
        cache.GetOrCreateAsync(key, e =>
        {
            e.AbsoluteExpirationRelativeToNow = CacheTtl;
            return factory();
        })!;

    [HttpGet("servers")]
    public async Task<IActionResult> Servers([FromQuery] string metric = "avgScore")
    {
        var data = await Cached($"analytics:servers:{metric}", async () =>
        {
            List<ServerComparisonEntry> entries = metric switch
            {
                "population" => await db.Characters.AsNoTracking()
                    .GroupBy(c => c.Server)
                    .Select(g => new ServerComparisonEntry(g.Key, g.Count()))
                    .ToListAsync(),

                "avgJobsAt99" => await AvgJobsAt99ByServerAsync(),

                "pctWithUltimate" => await PctWithUltimateByServerAsync(),

                _ /* avgScore */ => await db.CharacterAchievements.AsNoTracking()
                    .GroupBy(a => a.Character.Server)
                    .Select(g => new ServerComparisonEntry(g.Key, Math.Round(g.Average(a => (double)a.TotalScore), 0)))
                    .ToListAsync(),
            };
            return entries.OrderByDescending(e => e.Value).ThenBy(e => e.Server).ToList();
        });
        return Ok(data);
    }

    // Avg number of jobs at level 99 per synced character, by world. Two simple GROUP BYs
    // joined in memory (avoids fragile nested-GroupBy SQL translation).
    private async Task<List<ServerComparisonEntry>> AvgJobsAt99ByServerAsync()
    {
        var jobsByServer = await db.CharacterJobs.AsNoTracking()
            .Where(j => j.Level >= 99)
            .GroupBy(j => j.Character.Server)
            .Select(g => new { Server = g.Key, Jobs = g.Count() })
            .ToListAsync();
        var jobsMap = jobsByServer.ToDictionary(x => x.Server, x => x.Jobs);
        var charsByServer = await db.Characters.AsNoTracking()
            .GroupBy(c => c.Server).Select(g => new { Server = g.Key, Count = g.Count() }).ToListAsync();
        return charsByServer.Select(c => new ServerComparisonEntry(c.Server,
            c.Count == 0 ? 0 : Math.Round((double)jobsMap.GetValueOrDefault(c.Server) / c.Count, 2)))
            .ToList();
    }

    // % of each world's synced characters that own >= 1 ultimate weapon (rank >= 75).
    private async Task<List<ServerComparisonEntry>> PctWithUltimateByServerAsync()
    {
        var owned = await analytics.OwnedUltimateWeaponsAsync(server: null);
        var ownersByServer = owned
            .GroupBy(o => o.Server)
            .ToDictionary(g => g.Key, g => g.Select(x => x.CharacterId).Distinct().Count());
        var charsByServer = await db.Characters.AsNoTracking()
            .GroupBy(c => c.Server).Select(g => new { Server = g.Key, Count = g.Count() }).ToListAsync();
        return charsByServer.Select(c => new ServerComparisonEntry(c.Server,
            c.Count == 0 ? 0 : Math.Round(100.0 * ownersByServer.GetValueOrDefault(c.Server) / c.Count, 1)))
            .ToList();
    }

    [HttpGet("summary")]
    public async Task<IActionResult> Summary([FromQuery] string? server)
    {
        var data = await Cached($"analytics:summary:{server}", async () =>
        {
            var s = string.IsNullOrWhiteSpace(server) ? null : server;
            var characters = await analytics.CharacterScopeCountAsync(s);
            var worlds = s == null
                ? await db.Characters.AsNoTracking().Select(c => c.Server).Distinct().CountAsync()
                : 1;
            var jobsMastered = await db.CharacterJobs.AsNoTracking()
                .CountAsync(j => j.Level >= 99 && (s == null || j.Character.Server == s));
            var ultimateWeapons = (await analytics.OwnedUltimateWeaponsAsync(s)).Count;
            return new AnalyticsSummary(characters, worlds, jobsMastered, ultimateWeapons);
        });
        return Ok(data);
    }

    [HttpGet("ultimate-weapons")]
    public async Task<IActionResult> UltimateWeapons([FromQuery] string? server)
    {
        var data = await Cached($"analytics:uw:{server}", () => analytics.UltimateWeaponRarityAsync(server));
        return Ok(data);
    }

    [HttpGet("jobs")]
    public async Task<IActionResult> Jobs([FromQuery] string? server, [FromQuery] string mode = "maxed")
    {
        var data = await Cached($"analytics:jobs:{server}:{mode}", async () =>
        {
            var s = string.IsNullOrWhiteSpace(server) ? null : server;

            if (mode == "mained")
            {
                var rows = await db.CharacterJobs.AsNoTracking()
                    .Where(j => j.Level > 0 && (s == null || j.Character.Server == s))
                    .Select(j => new { j.CharacterId, j.JobId, j.Level })
                    .ToListAsync();

                // Per character, the single highest-level job (tie → canonical enum order).
                var mains = rows.GroupBy(x => x.CharacterId)
                    .Select(g => g.OrderByDescending(x => x.Level).ThenBy(x => x.JobId).First().JobId);

                return mains.GroupBy(j => j)
                    .Select(g => new JobPopularityEntry(g.Key.ToString(), g.Count()))
                    .OrderByDescending(e => e.Count).ThenBy(e => e.Job).ToList();
            }

            var grouped = await db.CharacterJobs.AsNoTracking()
                .Where(j => j.Level >= 99 && (s == null || j.Character.Server == s))
                .GroupBy(j => j.JobId)
                .Select(g => new { Job = g.Key, Count = g.Count() })
                .ToListAsync();

            return grouped.Select(x => new JobPopularityEntry(x.Job.ToString(), x.Count))
                .OrderByDescending(e => e.Count).ThenBy(e => e.Job).ToList();
        });

        return Ok(data);
    }
}
