using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Testcontainers.MsSql;
using Vanalytics.Api.Services.SearchServer;
using Vanalytics.Core.Models;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

public class AhScrapeSchedulerTests : IAsyncLifetime
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

    [Fact]
    public async Task NextBatch_ReturnsLeastRecentlyScrapedFirst()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var server = new GameServer
        {
            Name = "Asura",
            Status = Core.Enums.ServerStatus.Online,
            LastCheckedAt = DateTimeOffset.UtcNow,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        db.GameServers.Add(server);
        db.GameItems.Add(new GameItem { ItemId = 100, Name = "A", StackSize = 1, Flags = 0, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });   // auctionable, single only
        db.GameItems.Add(new GameItem { ItemId = 200, Name = "B", StackSize = 12, Flags = 0, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });  // auctionable, single + stack
        db.GameItems.Add(new GameItem { ItemId = 300, Name = "C", StackSize = 1, Flags = 0x40, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow }); // NoAuction -> excluded
        await db.SaveChangesAsync();
        int serverId = server.Id; // identity-assigned

        var sched = new AhScrapeScheduler(db);
        await sched.EnsureStateSeededAsync(serverId, CancellationToken.None);

        // 100/single, 200/single, 200/stack = 3 units; 300 excluded
        var batch = await sched.NextBatchAsync(serverId, 10, CancellationToken.None);
        Assert.Equal(3, batch.Count);
        Assert.DoesNotContain(batch, u => u.ItemId == 300);

        // mark 100/single scraped; it should now sort last
        await sched.MarkScrapedAsync(serverId, new[] { new ScrapeUnit(100, false) }, new Dictionary<(int ItemId, bool Stack), int>(), DateTimeOffset.UtcNow, CancellationToken.None);
        var next = await sched.NextBatchAsync(serverId, 1, CancellationToken.None);
        Assert.NotEqual(new ScrapeUnit(100, false), next[0]);
    }

    [Fact]
    public async Task EnsureStateSeeded_IsIdempotent()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var server = new GameServer
        {
            Name = "Bahamut",
            Status = Core.Enums.ServerStatus.Online,
            LastCheckedAt = DateTimeOffset.UtcNow,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        db.GameServers.Add(server);
        db.GameItems.Add(new GameItem { ItemId = 400, Name = "D", StackSize = 1, Flags = 0, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        db.GameItems.Add(new GameItem { ItemId = 500, Name = "E", StackSize = 12, Flags = 0, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();
        int serverId = server.Id;

        var sched = new AhScrapeScheduler(db);
        await sched.EnsureStateSeededAsync(serverId, CancellationToken.None);
        int countAfterFirst = await db.AhScrapeStates.CountAsync(s => s.ServerId == serverId);

        await sched.EnsureStateSeededAsync(serverId, CancellationToken.None);
        int countAfterSecond = await db.AhScrapeStates.CountAsync(s => s.ServerId == serverId);

        Assert.Equal(countAfterFirst, countAfterSecond);
    }
}
