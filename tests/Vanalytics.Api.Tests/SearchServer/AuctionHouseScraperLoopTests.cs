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

        public Task<IReadOnlyList<AhSale>> GetSalesHistoryAsync(int itemId, bool stack, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<AhSale>>(new[]
            {
                new AhSale(itemId * 10, DateTimeOffset.FromUnixTimeSeconds(1_700_000_000 + itemId), "S", "B", stack),
            });

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
        Assert.All(await db.AhScrapeStates.ToListAsync(), s => Assert.NotNull(s.LastScrapedAt));
    }
}
