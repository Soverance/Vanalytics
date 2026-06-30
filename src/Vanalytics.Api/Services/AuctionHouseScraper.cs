using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services.SearchServer;
using Vanalytics.Core.Models;
using Vanalytics.Core.Services.SearchServer;
using Vanalytics.Data;

namespace Vanalytics.Api.Services;

public class AuctionHouseScraper(
    ILogger<AuctionHouseScraper> logger,
    IServiceScopeFactory scopeFactory,
    AhScraperOptions options) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Enabled)
        {
            logger.LogInformation("AH scraper disabled (AhScraper:Enabled = false); skipping");
            return;
        }

        // Startup delay — let migrations finish before we hit the DB
        await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunCycleAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "AH scrape cycle failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(options.CycleIdleDelaySeconds), stoppingToken);
        }
    }

    private async Task RunCycleAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var codec = scope.ServiceProvider.GetRequiredService<SearchPacketCodec>();

        var worlds = await db.GameServers
            .Where(s => s.ScrapeEnabled && s.SearchHost != null && s.SearchPort != null)
            .ToListAsync(ct);

        logger.LogInformation("AH scrape cycle starting — {Count} eligible world(s)", worlds.Count);

        foreach (var world in worlds)
        {
            if (ct.IsCancellationRequested) break;
            try
            {
                await using var client = new SearchServerClient(codec);
                using var connectCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                connectCts.CancelAfter(options.PerWorldConnectTimeoutMs);
                await client.ConnectAsync(world.SearchHost!, world.SearchPort!.Value, connectCts.Token);

                int n = await ScrapeWorldOnceAsync(
                    world, options.BatchSize, client,
                    new AuctionHouseIngestor(db), new AhScrapeScheduler(db),
                    DateTimeOffset.UtcNow, ct);

                logger.LogInformation("AH scrape {World}: {Count} new sale(s) ingested", world.Name, n);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "AH scrape failed for world {World} — skipping to next", world.Name);
            }
        }
    }

    /// <summary>
    /// Scrapes one batch of items for a single world using the supplied (already-connected) client.
    /// Public so tests can invoke it directly with a fake client.
    /// </summary>
    public async Task<int> ScrapeWorldOnceAsync(
        GameServer world,
        int batchSize,
        ISearchServerClient client,
        AuctionHouseIngestor ingestor,
        AhScrapeScheduler scheduler,
        DateTimeOffset now,
        CancellationToken ct)
    {
        await scheduler.EnsureStateSeededAsync(world.Id, ct);
        var batch = await scheduler.NextBatchAsync(world.Id, batchSize, ct);

        int total = 0;
        var done = new List<ScrapeUnit>(batch.Count);

        foreach (var unit in batch)
        {
            if (ct.IsCancellationRequested) break;

            var sales = await client.GetSalesHistoryAsync(unit.ItemId, unit.Stack, ct);
            total += await ingestor.IngestAsync(unit.ItemId, world.Id, sales, now, ct);
            done.Add(unit);

            if (options.InterRequestDelayMs > 0)
                await Task.Delay(options.InterRequestDelayMs, ct);
        }

        await scheduler.MarkScrapedAsync(world.Id, done, now, ct);
        return total;
    }
}
