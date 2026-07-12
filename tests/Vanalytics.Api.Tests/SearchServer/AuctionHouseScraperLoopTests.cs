using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Testcontainers.MsSql;
using Vanalytics.Api.Services;
using Vanalytics.Api.Services.SearchServer;
using Vanalytics.Core.Models;
using Vanalytics.Core.Services.SearchServer;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

public class AuctionHouseScraperLoopTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private WebApplicationFactory<Program> _factory = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    var desc = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<VanalyticsDbContext>));
                    if (desc != null) services.Remove(desc);
                    services.AddDbContext<VanalyticsDbContext>(o => o.UseSqlServer(_container.GetConnectionString()));

                    // Remove all background hosted services to prevent interference with test data
                    services.RemoveAll<IHostedService>();
                });
                builder.ConfigureAppConfiguration((_, config) =>
                {
                    config.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Jwt:Secret"] = "TestSecretKeyThatIsAtLeast32BytesLongForHmacSha256!!",
                        ["Jwt:Issuer"] = "VanalyticsTest",
                        ["Jwt:Audience"] = "VanalyticsTest",
                        ["Jwt:AccessTokenExpirationMinutes"] = "15",
                        ["Jwt:RefreshTokenExpirationDays"] = "7",
                        ["SKIP_ITEM_SEED"] = "true",
                    });
                });
            });

        // Trigger startup (runs MigrateAsync to create schema)
        _ = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        await _factory.DisposeAsync();
        await _container.DisposeAsync();
    }

    private sealed class FakeClient : ISearchServerClient
    {
        public Task ConnectAsync(string host, int port, CancellationToken ct) => Task.CompletedTask;

        public Task<AhHistoryResult> GetSalesHistoryAsync(int itemId, bool stack, CancellationToken ct) =>
            Task.FromResult(new AhHistoryResult(5, new[]
            {
                new AhSale(itemId * 10, DateTimeOffset.FromUnixTimeSeconds(1_700_000_000 + itemId), "Seller", "Buyer", stack),
            }));

        public Task<IReadOnlyList<PlayerRecord>> GetOnlinePlayersAsync(CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<PlayerRecord>>(Array.Empty<PlayerRecord>());

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    [Fact]
    public async Task RunCycle_NoOps_WhenMasterDisabled()
    {
        // The migration seeds ScraperSettings Id=1 with MasterEnabled=false.
        // We verify IsMasterEnabledAsync reads that row and returns false.
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        bool enabled = await AuctionHouseScraper.IsMasterEnabledAsync(db, CancellationToken.None);
        Assert.False(enabled);
    }

    [Fact]
    public async Task ScrapeWorldOnce_IngestsBatch_AndMarksScraped()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var world = new GameServer
        {
            Name = "Asura",
            Status = Core.Enums.ServerStatus.Online,
            LastCheckedAt = DateTimeOffset.UtcNow,
            CreatedAt = DateTimeOffset.UtcNow,
            SearchHost = "x",
            SearchPort = 54002,
            ScrapeEnabled = true,
        };
        db.GameServers.Add(world);
        db.GameItems.Add(new GameItem
        {
            ItemId = 100,
            Name = "A",
            StackSize = 1,
            Flags = 0,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync();

        var scraper = new AuctionHouseScraper(
            NullLogger<AuctionHouseScraper>.Instance,
            null!,
            new AhScraperOptions { BatchSize = 10, InterRequestDelayMs = 0 });

        int n = await scraper.ScrapeWorldOnceAsync(
            world,
            batchSize: 10,
            client: new FakeClient(),
            ingestor: new AuctionHouseIngestor(db),
            scheduler: new AhScrapeScheduler(db),
            now: DateTimeOffset.UtcNow,
            ct: CancellationToken.None);

        Assert.True(n >= 1);
        Assert.True(await db.AuctionSales.AnyAsync());
        var scrapedStates = await db.AhScrapeStates.ToListAsync();
        Assert.All(scrapedStates, s => Assert.NotNull(s.LastScrapedAt));
        Assert.All(scrapedStates, s => Assert.Equal(5, s.LastQuantity));   // FakeClient reports OnAhQuantity=5
    }

    /// <summary>
    /// A protocol failure on one item (e.g. the stack request) must NOT abort the world's
    /// batch or stall the cursor. The successful (single) sale should still be ingested and
    /// BOTH units — including the failing stack unit — must advance their LastScrapedAt so
    /// the scraper doesn't re-hit the same bad item every cycle.
    /// </summary>
    [Fact]
    public async Task ScrapeWorldOnce_ItemProtocolFailure_DoesNotAbort_AndAdvancesCursor()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var world = new GameServer
        {
            Name = "Bahamut", Status = Core.Enums.ServerStatus.Online,
            LastCheckedAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow,
            SearchHost = "x", SearchPort = 54002, ScrapeEnabled = true,
        };
        db.GameServers.Add(world);
        db.GameItems.Add(new GameItem
        {
            ItemId = 4096, Name = "Fire Crystal", StackSize = 12, Flags = 0,   // stackable → single + stack units
            CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync();

        var scraper = new AuctionHouseScraper(
            NullLogger<AuctionHouseScraper>.Instance, null!,
            new AhScraperOptions { BatchSize = 10, InterRequestDelayMs = 0 });

        // Must not throw even though the stack request raises a protocol error.
        int n = await scraper.ScrapeWorldOnceAsync(
            world, batchSize: 10, client: new StackFailingClient(),
            ingestor: new AuctionHouseIngestor(db), scheduler: new AhScrapeScheduler(db),
            now: DateTimeOffset.UtcNow, ct: CancellationToken.None);

        Assert.True(n >= 1);                                   // the single sale was ingested
        Assert.True(await db.AuctionSales.AnyAsync());
        var states = await db.AhScrapeStates.ToListAsync();
        Assert.Equal(2, states.Count);                          // single + stack seeded
        Assert.All(states, s => Assert.NotNull(s.LastScrapedAt)); // BOTH advanced — no stall
    }

    /// <summary>
    /// When the reused connection drops mid-batch (an IOException / EndOfStreamException —
    /// "Unable to read beyond the end of the stream"), the world's scrape must NOT throw. It
    /// should persist what it already scraped, RETURN that partial count (so the cycle summary
    /// isn't reset to 0), and leave the un-scraped units for next cycle (cursor not advanced).
    /// </summary>
    [Fact]
    public async Task ScrapeWorldOnce_ConnectionDropsMidBatch_ReturnsPartialCount_LeavesRemainder()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var world = new GameServer
        {
            Name = "Ramuh", Status = Core.Enums.ServerStatus.Online,
            LastCheckedAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow,
            SearchHost = "x", SearchPort = 54002, ScrapeEnabled = true,
        };
        db.GameServers.Add(world);
        // Two non-stackable items → two single units in the batch.
        db.GameItems.Add(new GameItem { ItemId = 100, Name = "A", StackSize = 1, Flags = 0, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        db.GameItems.Add(new GameItem { ItemId = 101, Name = "B", StackSize = 1, Flags = 0, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();

        var scraper = new AuctionHouseScraper(
            NullLogger<AuctionHouseScraper>.Instance, null!,
            new AhScraperOptions { BatchSize = 10, InterRequestDelayMs = 0 });

        // First item scrapes; the connection then drops on the second request.
        int n = await scraper.ScrapeWorldOnceAsync(
            world, batchSize: 10, client: new DropAfterFirstClient(),
            ingestor: new AuctionHouseIngestor(db), scheduler: new AhScrapeScheduler(db),
            now: DateTimeOffset.UtcNow, ct: CancellationToken.None);

        Assert.True(n >= 1);                                   // partial count returned, not lost to a throw
        var states = await db.AhScrapeStates.ToListAsync();
        Assert.Equal(2, states.Count);
        Assert.Equal(1, states.Count(s => s.LastScrapedAt != null)); // only the completed unit advanced
    }

    /// <summary>Serves the first request, then simulates the connection dropping (EndOfStreamException).</summary>
    private sealed class DropAfterFirstClient : ISearchServerClient
    {
        private int _calls;

        public Task ConnectAsync(string host, int port, CancellationToken ct) => Task.CompletedTask;

        public Task<AhHistoryResult> GetSalesHistoryAsync(int itemId, bool stack, CancellationToken ct)
        {
            if (++_calls >= 2)
                throw new EndOfStreamException("Unable to read beyond the end of the stream.");
            return Task.FromResult(new AhHistoryResult(1, new[]
            {
                new AhSale(itemId * 10, DateTimeOffset.FromUnixTimeSeconds(1_700_000_000 + itemId), "Seller", "Buyer", stack),
            }));
        }

        public Task<IReadOnlyList<PlayerRecord>> GetOnlinePlayersAsync(CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<PlayerRecord>>(Array.Empty<PlayerRecord>());

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    /// <summary>Returns a sale for single requests; throws a protocol error for stack requests.</summary>
    private sealed class StackFailingClient : ISearchServerClient
    {
        public Task ConnectAsync(string host, int port, CancellationToken ct) => Task.CompletedTask;

        public Task<AhHistoryResult> GetSalesHistoryAsync(int itemId, bool stack, CancellationToken ct)
        {
            if (stack) throw new SearchProtocolException("unexpected type 0x86");
            return Task.FromResult(new AhHistoryResult(2, new[]
            {
                new AhSale(itemId * 10, DateTimeOffset.FromUnixTimeSeconds(1_700_000_000 + itemId), "Seller", "Buyer", false),
            }));
        }

        public Task<IReadOnlyList<PlayerRecord>> GetOnlinePlayersAsync(CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<PlayerRecord>>(Array.Empty<PlayerRecord>());

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
