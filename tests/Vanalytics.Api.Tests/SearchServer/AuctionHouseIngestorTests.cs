using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Testcontainers.MsSql;
using Vanalytics.Core.Models;
using Vanalytics.Api.Services.SearchServer;
using Vanalytics.Core.Services.SearchServer;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

public class AuctionHouseIngestorTests : IAsyncLifetime
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
    public async Task IngestAsync_InsertsNew_SkipsDuplicates()
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
        db.GameItems.Add(new GameItem
        {
            ItemId = 4096,
            Name = "Item",
            StackSize = 12,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync();

        var ingestor = new AuctionHouseIngestor(db);
        var sales = new List<AhSale>
        {
            new(1000, DateTimeOffset.FromUnixTimeSeconds(1_700_000_000), "S", "B", false),
            new(2000, DateTimeOffset.FromUnixTimeSeconds(1_700_001_000), "S", "B", false),
        };
        var now = DateTimeOffset.UtcNow;

        int first = await ingestor.IngestAsync(4096, server.Id, sales, now, CancellationToken.None);
        int second = await ingestor.IngestAsync(4096, server.Id, sales, now, CancellationToken.None);

        Assert.Equal(2, first);
        Assert.Equal(0, second);
        Assert.Equal(2, await db.AuctionSales.CountAsync());
    }

    [Fact]
    public async Task IngestAsync_Stack_UsesItemStackSize()
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
        db.GameItems.Add(new GameItem
        {
            ItemId = 5000,
            Name = "Stackable",
            StackSize = 12,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync();

        var ingestor = new AuctionHouseIngestor(db);
        var sales = new List<AhSale>
        {
            new(3000, DateTimeOffset.FromUnixTimeSeconds(1_700_002_000), "S2", "B2", true),  // stack sale
        };
        var now = DateTimeOffset.UtcNow;

        int inserted = await ingestor.IngestAsync(5000, server.Id, sales, now, CancellationToken.None);

        Assert.Equal(1, inserted);
        var row = await db.AuctionSales.SingleAsync(s => s.ItemId == 5000);
        Assert.Equal(12, row.StackSize); // should use item's StackSize
    }
}
