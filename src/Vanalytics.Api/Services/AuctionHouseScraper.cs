using System.Net.Sockets;
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
    /// <summary>
    /// Reads the DB-backed master toggle for the AH scraper. Returns false when the row is absent (safe default).
    /// Public so tests can invoke it directly.
    /// </summary>
    public static async Task<bool> IsMasterEnabledAsync(VanalyticsDbContext db, CancellationToken ct)
    {
        var setting = await db.ScraperSettings.AsNoTracking().FirstOrDefaultAsync(s => s.Id == 1, ct);
        return setting?.MasterEnabled ?? false;
    }

    /// <summary>Upserts the singleton run-state row (Id=1), applies <paramref name="mutate"/>, and saves.</summary>
    private static async Task UpdateRunStateAsync(
        VanalyticsDbContext db, Action<ScraperRunState> mutate, CancellationToken ct)
    {
        var state = await db.ScraperRunStates.FirstOrDefaultAsync(s => s.Id == 1, ct)
                    ?? db.ScraperRunStates.Add(new ScraperRunState { Id = 1 }).Entity;
        mutate(state);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Marks a cycle as started: IsRunning=true, LastCycleStartedAt=now.</summary>
    public static Task MarkCycleStartAsync(VanalyticsDbContext db, DateTimeOffset now, CancellationToken ct) =>
        UpdateRunStateAsync(db, s =>
        {
            s.IsRunning = true;
            s.LastCycleStartedAt = now;
        }, ct);

    /// <summary>Marks a cycle as finished cleanly: IsRunning=false, counts + finish time set, error cleared.</summary>
    public static Task MarkCycleEndAsync(
        VanalyticsDbContext db, int worldsProcessed, int salesIngested, DateTimeOffset now, CancellationToken ct) =>
        UpdateRunStateAsync(db, s =>
        {
            s.IsRunning = false;
            s.LastCycleFinishedAt = now;
            s.WorldsProcessedLastCycle = worldsProcessed;
            s.SalesIngestedLastCycle = salesIngested;
            s.LastError = null;
            s.LastErrorAt = null;
        }, ct);

    /// <summary>Records a whole-cycle failure: IsRunning=false, LastError + LastErrorAt set.</summary>
    public static Task MarkCycleErrorAsync(VanalyticsDbContext db, string error, DateTimeOffset now, CancellationToken ct) =>
        UpdateRunStateAsync(db, s =>
        {
            s.IsRunning = false;
            s.LastError = error.Length > 2000 ? error[..2000] : error;
            s.LastErrorAt = now;
        }, ct);

    /// <summary>
    /// Records the outcome of a single world's scrape onto the entity: clears the error on success,
    /// stamps the message + timestamp on failure. Pure (no DB call) so the caller controls persistence.
    /// </summary>
    public static void ApplyWorldScrapeResult(GameServer world, string? error, DateTimeOffset now)
    {
        world.LastScrapeError = error;
        world.LastScrapeErrorAt = error is null ? null : now;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Startup delay — let migrations finish before we hit the DB
        await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
                if (await IsMasterEnabledAsync(db, stoppingToken))
                    await RunCycleAsync(stoppingToken);
                else
                    logger.LogDebug("AH scraper master disabled; idling");
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "AH scrape cycle failed");
                await RecordCycleFailureAsync(ex, stoppingToken);
            }

            await Task.Delay(TimeSpan.FromSeconds(options.CycleIdleDelaySeconds), stoppingToken);
        }
    }

    /// <summary>Best-effort recording of a whole-cycle failure to run-state; never throws into the loop.</summary>
    private async Task RecordCycleFailureAsync(Exception ex, CancellationToken ct)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            await MarkCycleErrorAsync(db, ex.Message, DateTimeOffset.UtcNow, ct);
        }
        catch (Exception inner) when (inner is not OperationCanceledException)
        {
            logger.LogError(inner, "Failed to record AH scrape cycle error to run-state");
        }
    }

    private async Task RunCycleAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var codec = scope.ServiceProvider.GetRequiredService<SearchPacketCodec>();

        await MarkCycleStartAsync(db, DateTimeOffset.UtcNow, ct);

        var worlds = await db.GameServers
            .Where(s => s.ScrapeEnabled && s.SearchHost != null && s.SearchPort != null)
            .ToListAsync(ct);

        logger.LogInformation("AH scrape cycle starting — {Count} eligible world(s)", worlds.Count);

        int totalSales = 0;
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

                totalSales += n;
                ApplyWorldScrapeResult(world, error: null, DateTimeOffset.UtcNow);
                logger.LogInformation("AH scrape {World}: {Count} new sale(s) ingested", world.Name, n);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                ApplyWorldScrapeResult(world, ex.Message, DateTimeOffset.UtcNow);
                logger.LogWarning(ex, "AH scrape failed for world {World} — skipping to next", world.Name);
            }
        }

        // Persist per-world results and stamp the cycle as finished (clears any prior cycle error).
        await MarkCycleEndAsync(db, worlds.Count, totalSales, DateTimeOffset.UtcNow, ct);
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

            try
            {
                var sales = await client.GetSalesHistoryAsync(unit.ItemId, unit.Stack, ct);
                total += await ingestor.IngestAsync(unit.ItemId, world.Id, sales, now, ct);
            }
            catch (SearchProtocolException ex)
            {
                // A per-item protocol/decode failure must not abort the world's batch or stall
                // the cursor. Log it and fall through to mark the unit scraped — it rotates to
                // the back of the least-recently-scraped queue instead of blocking every cycle.
                logger.LogWarning(ex, "AH scrape item {ItemId} (stack={Stack}) on {World} skipped: {Message}",
                    unit.ItemId, unit.Stack, world.Name, ex.Message);
            }
            catch (Exception ex) when (ex is IOException or SocketException)
            {
                // The reused TCP connection dropped mid-batch — search servers close long-lived
                // connections (this is the "Unable to read beyond the end of the stream"). Stop
                // using the dead socket, persist what we already scraped, and resume from the
                // cursor next cycle. Not a world failure — this unit + the rest are just deferred
                // (the unit is NOT added to `done`, so its cursor position is preserved).
                logger.LogInformation(
                    "AH scrape {World}: connection dropped after {Done} item(s) — resuming next cycle ({Message})",
                    world.Name, done.Count, ex.Message);
                break;
            }
            done.Add(unit);

            if (options.InterRequestDelayMs > 0)
                await Task.Delay(options.InterRequestDelayMs, ct);
        }

        await scheduler.MarkScrapedAsync(world.Id, done, now, ct);
        return total;
    }
}
