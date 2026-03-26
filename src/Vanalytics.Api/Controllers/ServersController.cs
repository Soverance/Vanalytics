using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Vanalytics.Api.Services;
using Vanalytics.Core.Enums;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/servers")]
public class ServersController : ControllerBase
{
    private readonly VanalyticsDbContext _db;
    private readonly IMemoryCache _cache;
    private readonly VanadielClock _clock;

    public ServersController(VanalyticsDbContext db, IMemoryCache cache, VanadielClock clock)
    {
        _db = db;
        _cache = cache;
        _clock = clock;
    }

    [HttpGet("clock")]
    public IActionResult GetClock() => Ok(_clock.GetClock());

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var servers = await _db.GameServers
            .OrderBy(s => s.Name)
            .Select(s => new
            {
                s.Id,
                s.Name,
                Status = s.Status.ToString(),
                s.LastCheckedAt,
            })
            .ToListAsync();

        return Ok(servers);
    }

    [HttpGet("{name}/history")]
    public async Task<IActionResult> History(string name, [FromQuery] int days = 30)
    {
        if (days > 365 && days != 0) days = 365;

        var now = DateTimeOffset.UtcNow;

        var server = await _db.GameServers
            .FirstOrDefaultAsync(s => s.Name == name);

        if (server is null) return NotFound();

        var since = days == 0 ? server.CreatedAt : now.AddDays(-days);

        var history = await _db.ServerStatusChanges
            .Where(h => h.GameServerId == server.Id && (h.EndedAt == null || h.EndedAt > since))
            .OrderByDescending(h => h.StartedAt)
            .Select(h => new
            {
                Status = h.Status.ToString(),
                h.StartedAt,
                h.EndedAt,
            })
            .ToListAsync();

        // Calculate uptime percentage over the period
        var totalMinutes = (now - since).TotalMinutes;
        var onlineMinutes = 0.0;

        var allChanges = await _db.ServerStatusChanges
            .Where(h => h.GameServerId == server.Id && (h.EndedAt == null || h.EndedAt > since))
            .ToListAsync();

        foreach (var change in allChanges)
        {
            if (change.Status != ServerStatus.Online) continue;

            var start = change.StartedAt < since ? since : change.StartedAt;
            var end = change.EndedAt ?? now;
            onlineMinutes += (end - start).TotalMinutes;
        }

        var uptimePercent = totalMinutes > 0 ? Math.Round(onlineMinutes / totalMinutes * 100, 2) : 0;

        // Uptime trend for this server
        var bucketMinutes = days switch
        {
            0 => 1440,
            >= 90 => 1440,
            >= 7 => 60,
            _ => 5
        };
        var bucketSpan = TimeSpan.FromMinutes(bucketMinutes);
        var trendStart = days == 0 ? server.CreatedAt : since;
        trendStart = new DateTimeOffset(trendStart.UtcDateTime.Ticks / bucketSpan.Ticks * bucketSpan.Ticks, TimeSpan.Zero);
        var uptimeTrend = new List<object>();
        for (var t = trendStart; t <= now; t = t.Add(bucketSpan))
        {
            var bucketEnd = t.Add(bucketSpan);
            var wasOnline = allChanges.Any(c =>
                c.Status == ServerStatus.Online &&
                c.StartedAt < bucketEnd &&
                (c.EndedAt == null || c.EndedAt > t));
            uptimeTrend.Add(new
            {
                Timestamp = t,
                Percent = wasOnline ? 100.0 : 0.0
            });
        }

        return Ok(new
        {
            server.Name,
            Status = server.Status.ToString(),
            server.LastCheckedAt,
            Days = days,
            UptimePercent = uptimePercent,
            UptimeTrend = uptimeTrend,
            History = history,
        });
    }

    [HttpGet("analytics")]
    public async Task<IActionResult> Analytics([FromQuery] int days = 30)
    {
        var cacheKey = $"server-analytics-{days}";
        if (_cache.TryGetValue(cacheKey, out object? cached))
            return Ok(cached);

        var now = DateTimeOffset.UtcNow;
        var servers = await _db.GameServers.OrderBy(s => s.Name).ToListAsync();

        // For "All Time" (days=0), use earliest server creation date instead of MinValue
        var since = days == 0 && servers.Count > 0
            ? servers.Min(s => s.CreatedAt)
            : days == 0 ? now : now.AddDays(-days);

        var allChanges = await _db.ServerStatusChanges
            .Where(h => h.EndedAt == null || h.EndedAt > since)
            .ToListAsync();

        var totalMinutes = (now - since).TotalMinutes;

        // Service health
        var onlineCount = servers.Count(s => s.Status == ServerStatus.Online);
        var onlinePercent = servers.Count > 0 ? Math.Round((double)onlineCount / servers.Count * 100, 2) : 0;

        // Per-server uptime calculation
        var serverUptimes = new Dictionary<string, double>();
        foreach (var server in servers)
        {
            var changes = allChanges.Where(c => c.GameServerId == server.Id).ToList();
            var onlineMinutes = 0.0;
            foreach (var change in changes)
            {
                if (change.Status != ServerStatus.Online) continue;
                var start = change.StartedAt < since ? since : change.StartedAt;
                var end = change.EndedAt ?? now;
                onlineMinutes += (end - start).TotalMinutes;
            }
            serverUptimes[server.Name] = totalMinutes > 0 ? Math.Round(onlineMinutes / totalMinutes * 100, 2) : 0;
        }

        var avgUptime = serverUptimes.Count > 0 ? Math.Round(serverUptimes.Values.Average(), 2) : 0;

        var healthStatus = onlinePercent >= 90 ? "Healthy" : onlinePercent >= 50 ? "Degraded" : "Down";

        // Uptime trend — % of servers online at each time bucket
        var bucketMinutes = days switch
        {
            0 => 1440,    // daily
            >= 90 => 1440, // daily
            >= 7 => 60,    // hourly
            _ => 5         // 5-min
        };
        var bucketSpan = TimeSpan.FromMinutes(bucketMinutes);
        var trendStart = days == 0 ? servers.Min(s => s.CreatedAt) : since;
        trendStart = new DateTimeOffset(trendStart.UtcDateTime.Ticks / bucketSpan.Ticks * bucketSpan.Ticks, TimeSpan.Zero);
        var trend = new List<object>();
        for (var t = trendStart; t <= now; t = t.Add(bucketSpan))
        {
            var bucketEnd = t.Add(bucketSpan);
            var onlineInBucket = 0;
            foreach (var server in servers)
            {
                var wasOnline = allChanges.Any(c =>
                    c.GameServerId == server.Id &&
                    c.Status == ServerStatus.Online &&
                    c.StartedAt < bucketEnd &&
                    (c.EndedAt == null || c.EndedAt > t));
                if (wasOnline) onlineInBucket++;
            }
            trend.Add(new
            {
                Timestamp = t,
                Percent = servers.Count > 0 ? Math.Round((double)onlineInBucket / servers.Count * 100, 2) : 0
            });
        }

        // Heatmap — per-server, per-day/week uptime
        var heatmapBucketDays = days > 90 ? 7 : 1;
        var heatmap = new List<object>();
        foreach (var server in servers)
        {
            var changes = allChanges.Where(c => c.GameServerId == server.Id).ToList();
            var cells = new List<object>();
            var heatmapStart = days == 0 ? server.CreatedAt.Date : since.Date;
            // Align to ISO week (Monday) for weekly buckets
            if (heatmapBucketDays == 7)
            {
                var dow = ((int)heatmapStart.DayOfWeek + 6) % 7; // Monday=0
                heatmapStart = heatmapStart.AddDays(-dow);
            }
            for (var d = heatmapStart; d <= now.Date; d = d.AddDays(heatmapBucketDays))
            {
                var cellStart = new DateTimeOffset(d, TimeSpan.Zero);
                var cellEnd = new DateTimeOffset(d.AddDays(heatmapBucketDays), TimeSpan.Zero);
                if (cellEnd > now) cellEnd = now;
                var cellMinutes = (cellEnd - cellStart).TotalMinutes;
                var cellOnlineMinutes = 0.0;
                var statusCounts = new Dictionary<ServerStatus, double>();
                foreach (var change in changes)
                {
                    if (change.StartedAt >= cellEnd || (change.EndedAt != null && change.EndedAt <= cellStart)) continue;
                    var start = change.StartedAt < cellStart ? cellStart : change.StartedAt;
                    var end = change.EndedAt == null || change.EndedAt > cellEnd ? cellEnd : change.EndedAt.Value;
                    var minutes = (end - start).TotalMinutes;
                    if (change.Status == ServerStatus.Online) cellOnlineMinutes += minutes;
                    statusCounts[change.Status] = statusCounts.GetValueOrDefault(change.Status) + minutes;
                }
                var dominantStatus = statusCounts.Count > 0
                    ? statusCounts.OrderByDescending(kv => kv.Value).First().Key.ToString()
                    : "Unknown";
                cells.Add(new
                {
                    Date = d.ToString("yyyy-MM-dd"),
                    UptimePercent = cellMinutes > 0 ? Math.Round(cellOnlineMinutes / cellMinutes * 100, 2) : 0,
                    DominantStatus = dominantStatus
                });
            }
            heatmap.Add(new { server.Name, Days = cells });
        }

        // Server rankings
        var rankings = serverUptimes
            .OrderByDescending(kv => kv.Value)
            .Select(kv => new
            {
                Name = kv.Key,
                UptimePercent = kv.Value,
                Status = servers.First(s => s.Name == kv.Key).Status.ToString()
            })
            .ToList();

        // Recent incidents — latest 10 non-Online status changes
        // Materialize first, then format in-memory (EF Core can't translate FormatDuration)
        var rawIncidents = await _db.ServerStatusChanges
            .Include(c => c.GameServer)
            .Where(c => c.Status != ServerStatus.Online)
            .OrderByDescending(c => c.StartedAt)
            .Take(10)
            .ToListAsync();

        var incidents = rawIncidents.Select(c => new
        {
            c.Id,
            ServerName = c.GameServer.Name,
            Status = c.Status.ToString(),
            c.StartedAt,
            c.EndedAt,
            Duration = c.EndedAt != null
                ? FormatDuration(c.EndedAt.Value - c.StartedAt)
                : (string?)null
        }).ToList();

        // Determine the most recent lastCheckedAt across all servers (for stale data warning)
        var lastCheckedAt = servers.Count > 0 ? servers.Max(s => s.LastCheckedAt) : (DateTimeOffset?)null;

        var result = new
        {
            ServiceHealth = new
            {
                Status = healthStatus,
                OnlinePercent = onlinePercent,
                UptimePercent = avgUptime,
                TotalServers = servers.Count,
                OnlineServers = onlineCount,
                LastCheckedAt = lastCheckedAt
            },
            UptimeTrend = trend,
            ServerRankings = rankings,
            Heatmap = heatmap,
            RecentIncidents = incidents
        };

        _cache.Set(cacheKey, result, TimeSpan.FromMinutes(5));

        return Ok(result);
    }

    private static string FormatDuration(TimeSpan span)
    {
        if (span.TotalDays >= 1) return $"{(int)span.TotalDays}d {span.Hours}h";
        if (span.TotalHours >= 1) return $"{(int)span.TotalHours}h {span.Minutes}m";
        return $"{(int)span.TotalMinutes}m";
    }
}
