using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services.SearchServer;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Core.Services.SearchServer;
using Vanalytics.Data;

namespace Vanalytics.Api.Controllers;

[ApiController]
[Route("api/admin/economy")]
[Authorize(Roles = "Admin")]
public class AdminEconomyController(
    VanalyticsDbContext db,
    SearchEndpointProber prober,
    DiscoveryOrchestrator discoveryOrchestrator,
    SearchPacketCodec codec) : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };
    public record EndpointRequest(string Host, int Port);
    public record ToggleRequest(bool Enabled);

    [HttpGet("worlds")]
    public async Task<IActionResult> Worlds()
    {
        var worlds = await db.GameServers
            .OrderBy(s => s.Name)
            .Select(s => new
            {
                s.Id,
                s.Name,
                s.Status,
                s.SearchHost,
                s.SearchPort,
                s.ScrapeEnabled,
                s.MappingSource,
                s.MappingConfidence,
                s.EndpointHealthy,
                s.LastProbedAt,
                s.LastScrapeError,
                s.LastScrapeErrorAt,
                saleCount = db.AuctionSales.Count(a => a.ServerId == s.Id),
                lastScrapedAt = db.AhScrapeStates.Where(a => a.ServerId == s.Id).Max(a => (DateTimeOffset?)a.LastScrapedAt),
            })
            .ToListAsync();
        return Ok(worlds);
    }

    [HttpGet("status")]
    public async Task<IActionResult> Status()
    {
        var s = await db.ScraperRunStates.AsNoTracking().FirstOrDefaultAsync(x => x.Id == 1);
        return Ok(new
        {
            isRunning = s?.IsRunning ?? false,
            lastCycleStartedAt = s?.LastCycleStartedAt,
            lastCycleFinishedAt = s?.LastCycleFinishedAt,
            worldsProcessedLastCycle = s?.WorldsProcessedLastCycle ?? 0,
            salesIngestedLastCycle = s?.SalesIngestedLastCycle ?? 0,
            lastError = s?.LastError,
            lastErrorAt = s?.LastErrorAt,
        });
    }

    [HttpGet("master")]
    public async Task<IActionResult> GetMaster()
    {
        var s = await db.ScraperSettings.FirstOrDefaultAsync(x => x.Id == 1);
        return Ok(new { masterEnabled = s?.MasterEnabled ?? false });
    }

    [HttpPut("master")]
    public async Task<IActionResult> SetMaster([FromBody] ToggleRequest req)
    {
        var s = await db.ScraperSettings.FirstOrDefaultAsync(x => x.Id == 1)
                ?? db.ScraperSettings.Add(new ScraperSetting { Id = 1 }).Entity;
        s.MasterEnabled = req.Enabled;
        s.UpdatedAt = DateTimeOffset.UtcNow;
        s.UpdatedByUserId = Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var g) ? g : null;
        await db.SaveChangesAsync();
        return Ok(new { masterEnabled = s.MasterEnabled });
    }

    [HttpPut("{serverId:int}/endpoint")]
    public async Task<IActionResult> SetEndpoint(int serverId, [FromBody] EndpointRequest req)
    {
        var gs = await db.GameServers.FindAsync(serverId);
        if (gs is null) return NotFound();
        gs.SearchHost = req.Host;
        gs.SearchPort = req.Port;
        gs.MappingSource = MappingSource.Manual;
        await db.SaveChangesAsync();
        return Ok(new { gs.SearchHost, gs.SearchPort });
    }

    [HttpPost("{serverId:int}/test")]
    public async Task<IActionResult> Test(int serverId, CancellationToken ct)
    {
        var gs = await db.GameServers.FindAsync([serverId], ct);
        if (gs is null) return NotFound();
        if (gs.SearchHost is null || gs.SearchPort is null)
            return BadRequest(new { message = "No endpoint set" });
        bool healthy = await prober.IsSearchServerAsync(gs.SearchHost, gs.SearchPort.Value, probeItemId: 4096, timeoutMs: 3000, ct);
        gs.EndpointHealthy = healthy;
        gs.LastProbedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(new { healthy });
    }

    [HttpPut("{serverId:int}/scrape-enabled")]
    public async Task<IActionResult> SetScrapeEnabled(int serverId, [FromBody] ToggleRequest req)
    {
        var gs = await db.GameServers.FindAsync(serverId);
        if (gs is null) return NotFound();
        if (req.Enabled && gs.SearchHost is null)
            return BadRequest(new { message = "Set an endpoint before enabling" });
        gs.ScrapeEnabled = req.Enabled;
        await db.SaveChangesAsync();
        return Ok(new { gs.ScrapeEnabled });
    }

    // ── Discovery endpoints ───────────────────────────────────────────────────

    [HttpPost("discovery/start")]
    public IActionResult StartDiscovery()
    {
        if (!discoveryOrchestrator.TryStart(codec, out var error))
            return Conflict(new { message = error });
        return Ok();
    }

    [HttpPost("discovery/cancel")]
    public IActionResult CancelDiscovery() =>
        discoveryOrchestrator.TryCancel() ? Ok() : NotFound();

    [HttpGet("discovery/cidrs")]
    public async Task<IActionResult> GetCidrs()
    {
        var s = await db.ScraperSettings.AsNoTracking().FirstOrDefaultAsync(x => x.Id == 1);
        return Ok(new { cidrs = s?.DiscoveryCidrsText ?? "" });
    }

    public record CidrsRequest(string Cidrs);

    [HttpPut("discovery/cidrs")]
    public async Task<IActionResult> SetCidrs([FromBody] CidrsRequest req)
    {
        var invalid = CidrRange.ParseCidrLines(req.Cidrs).Where(l => !CidrRange.IsValid(l)).ToList();
        if (invalid.Count > 0)
            return BadRequest(new { message = "Invalid CIDR range(s)", invalid });

        var s = await db.ScraperSettings.FirstOrDefaultAsync(x => x.Id == 1)
                ?? db.ScraperSettings.Add(new ScraperSetting { Id = 1 }).Entity;
        s.DiscoveryCidrsText = req.Cidrs;
        s.UpdatedAt = DateTimeOffset.UtcNow;
        s.UpdatedByUserId = Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var g) ? g : null;
        await db.SaveChangesAsync();
        return Ok(new { cidrs = s.DiscoveryCidrsText });
    }

    [HttpGet("discovery/report")]
    public async Task<IActionResult> DiscoveryReport()
    {
        var rows = await db.DiscoveredEndpoints.AsNoTracking()
            .OrderByDescending(e => e.ScannedAt).ThenBy(e => e.Ip).ToListAsync();

        var serverNames = await db.GameServers.AsNoTracking().ToDictionaryAsync(g => g.Id, g => g.Name);

        var parsed = rows.Select(r => new
        {
            r.Id, r.Ip, r.Port, r.ScannedAt, r.MappedServerId,
            Samples = DiscoverySamples.Deserialize(r.SampleSalesJson),
        }).ToList();

        var itemIds = parsed.SelectMany(p => p.Samples.Select(s => s.ItemId)).Distinct().ToList();
        var itemNames = await db.GameItems.AsNoTracking()
            .Where(i => itemIds.Contains(i.ItemId))
            .ToDictionaryAsync(i => i.ItemId, i => i.Name);

        var result = parsed.Select(p => new
        {
            p.Id, p.Ip, p.Port, p.ScannedAt, p.MappedServerId,
            mappedServerName = p.MappedServerId is int sid && serverNames.TryGetValue(sid, out var n) ? n : null,
            sampleSales = p.Samples.Select(s => new
            {
                s.ItemId,
                itemName = itemNames.TryGetValue(s.ItemId, out var nm) ? nm : $"Item {s.ItemId}",
                sales = s.Sales,
            }),
        });

        return Ok(result);
    }

    public record MapRequest(int? ServerId);

    [HttpPost("discovery/{id:int}/map")]
    public async Task<IActionResult> MapDiscovery(int id, [FromBody] MapRequest req)
    {
        var ep = await db.DiscoveredEndpoints.FindAsync(id);
        if (ep is null) return NotFound();

        if (req.ServerId is null)
        {
            ep.MappedServerId = null;
            await db.SaveChangesAsync();
            return Ok(new { ep.Id, mappedServerId = (int?)null, mappedServerName = (string?)null });
        }

        var gs = await db.GameServers.FindAsync(req.ServerId.Value);
        if (gs is null) return NotFound();

        gs.SearchHost = ep.Ip;
        gs.SearchPort = ep.Port;
        gs.MappingSource = MappingSource.Manual;
        ep.MappedServerId = gs.Id;
        await db.SaveChangesAsync();
        return Ok(new { ep.Id, mappedServerId = gs.Id, mappedServerName = gs.Name });
    }

    [HttpGet("discovery/progress")]
    public async Task ProgressDiscovery(CancellationToken ct)
    {
        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers.Connection = "keep-alive";

        var job = discoveryOrchestrator.GetJob();
        if (job is null)
        {
            await WriteDiscoveryEventAsync("completed", new DiscoveryProgressEvent { Type = "Completed" }, ct);
            return;
        }

        if (job.LastEvent is not null)
            await WriteDiscoveryEventAsync(job.LastEvent.Type.ToLowerInvariant(), job.LastEvent, ct);

        try
        {
            await foreach (var evt in job.Channel.Reader.ReadAllAsync(ct))
                await WriteDiscoveryEventAsync(evt.Type.ToLowerInvariant(), evt, ct);
        }
        catch (OperationCanceledException)
        {
            // Client disconnected
        }
    }

    private async Task WriteDiscoveryEventAsync(string eventType, object payload, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(payload, JsonOptions);
        await Response.WriteAsync($"event: {eventType}\ndata: {json}\n\n", ct);
        await Response.Body.FlushAsync(ct);
    }
}
