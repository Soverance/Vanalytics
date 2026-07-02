using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Testcontainers.MsSql;
using Vanalytics.Api.Services;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

public class ScraperRunStateTests : IAsyncLifetime
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
        _ = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        await _factory.DisposeAsync();
        await _container.DisposeAsync();
    }

    [Fact]
    public async Task MarkCycleStart_SetsRunningAndStartTime()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var now = DateTimeOffset.UtcNow;

        await AuctionHouseScraper.MarkCycleStartAsync(db, now, CancellationToken.None);

        var state = await db.ScraperRunStates.AsNoTracking().FirstAsync(s => s.Id == 1);
        Assert.True(state.IsRunning);
        Assert.Equal(now, state.LastCycleStartedAt);
    }

    [Fact]
    public async Task MarkCycleEnd_RecordsCounts_ClearsRunningAndError()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        // Simulate a running cycle that had a prior error hanging around
        await AuctionHouseScraper.MarkCycleStartAsync(db, DateTimeOffset.UtcNow, CancellationToken.None);
        await AuctionHouseScraper.MarkCycleErrorAsync(db, "boom", DateTimeOffset.UtcNow, CancellationToken.None);

        var finishedAt = DateTimeOffset.UtcNow;
        await AuctionHouseScraper.MarkCycleEndAsync(db, worldsProcessed: 3, salesIngested: 42, finishedAt, CancellationToken.None);

        var state = await db.ScraperRunStates.AsNoTracking().FirstAsync(s => s.Id == 1);
        Assert.False(state.IsRunning);
        Assert.Equal(finishedAt, state.LastCycleFinishedAt);
        Assert.Equal(3, state.WorldsProcessedLastCycle);
        Assert.Equal(42, state.SalesIngestedLastCycle);
        Assert.Null(state.LastError);
        Assert.Null(state.LastErrorAt);
    }

    [Fact]
    public async Task MarkCycleError_RecordsMessage_ClearsRunning()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        await AuctionHouseScraper.MarkCycleStartAsync(db, DateTimeOffset.UtcNow, CancellationToken.None);

        var erroredAt = DateTimeOffset.UtcNow;
        await AuctionHouseScraper.MarkCycleErrorAsync(db, "connection reset", erroredAt, CancellationToken.None);

        var state = await db.ScraperRunStates.AsNoTracking().FirstAsync(s => s.Id == 1);
        Assert.False(state.IsRunning);
        Assert.Equal("connection reset", state.LastError);
        Assert.Equal(erroredAt, state.LastErrorAt);
    }
}
