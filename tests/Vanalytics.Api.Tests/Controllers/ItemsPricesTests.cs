using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Testcontainers.MsSql;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Api.Tests.Controllers;

public class ItemsPricesTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

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
        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _container.DisposeAsync();
    }

    private record CrossServerPriceDto(string Server, int Median, int Min, int Max, int Average, int SaleCount);
    private record CrossServerDto(int Days, List<CrossServerPriceDto> Servers);
    private record PriceStatsDto(int Median, int Min, int Max, int Average, double SalesPerDay);
    private record PricesDto(int TotalCount, int Page, int PageSize, int Days, PriceStatsDto? Stats, List<object> Sales);
    private record PricesOnAhDto(int TotalCount, int? OnAh, DateTimeOffset? OnAhAsOf);

    [Fact]
    public async Task Prices_AllTime_IncludesRowsOlderThanAYear()
    {
        const int itemId = 6100;
        int serverId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            db.GameItems.Add(new GameItem { ItemId = itemId, Name = "Old", StackSize = 1, Flags = 0, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
            var gs = new GameServer { Name = "Siren", Status = ServerStatus.Online, LastCheckedAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow };
            db.GameServers.Add(gs);
            await db.SaveChangesAsync();
            serverId = gs.Id;
            var now = DateTimeOffset.UtcNow;
            db.AuctionSales.Add(new AuctionSale { ItemId = itemId, ServerId = serverId, Price = 100, SoldAt = now.AddDays(-500), SellerName = "S", BuyerName = "B", StackSize = 1, ObservedAt = now });
            db.AuctionSales.Add(new AuctionSale { ItemId = itemId, ServerId = serverId, Price = 200, SoldAt = now.AddDays(-10), SellerName = "S", BuyerName = "B", StackSize = 1, ObservedAt = now });
            await db.SaveChangesAsync();
        }

        var body = await _client.GetFromJsonAsync<PricesDto>($"/api/items/{itemId}/prices?server=Siren&days=0");
        Assert.NotNull(body);
        Assert.Equal(2, body!.TotalCount);                 // 500-day-old row included
        Assert.NotNull(body.Stats);
        // salesPerDay denominator is the ~500-day span, so the rate is small (< a fixed-30d rate).
        Assert.True(body.Stats!.SalesPerDay < 0.1);
    }

    [Fact]
    public async Task Prices_NoDaysCap_Above365Behaves()
    {
        const int itemId = 6101;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            db.GameItems.Add(new GameItem { ItemId = itemId, Name = "X", StackSize = 1, Flags = 0, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
            var gs = new GameServer { Name = "Asura", Status = ServerStatus.Online, LastCheckedAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow };
            db.GameServers.Add(gs);
            await db.SaveChangesAsync();
            var now = DateTimeOffset.UtcNow;
            db.AuctionSales.Add(new AuctionSale { ItemId = itemId, ServerId = gs.Id, Price = 100, SoldAt = now.AddDays(-500), SellerName = "S", BuyerName = "B", StackSize = 1, ObservedAt = now });
            await db.SaveChangesAsync();
        }

        // days=800 must NOT be clamped to 365 — the 500-day-old sale is within 800 days.
        var body = await _client.GetFromJsonAsync<PricesDto>($"/api/items/{itemId}/prices?server=Asura&days=800");
        Assert.NotNull(body);
        Assert.Equal(1, body!.TotalCount);
    }

    [Fact]
    public async Task Prices_StackFilter_SeparatesSingleAndStackSales()
    {
        const int itemId = 6200;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            db.GameItems.Add(new GameItem { ItemId = itemId, Name = "Crystal", StackSize = 12, Flags = 0, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
            var gs = new GameServer { Name = "Siren", Status = ServerStatus.Online, LastCheckedAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow };
            db.GameServers.Add(gs);
            await db.SaveChangesAsync();
            var now = DateTimeOffset.UtcNow;
            db.AuctionSales.Add(new AuctionSale { ItemId = itemId, ServerId = gs.Id, Price = 1000, SoldAt = now.AddHours(-1), SellerName = "S", BuyerName = "B", StackSize = 1, ObservedAt = now });
            db.AuctionSales.Add(new AuctionSale { ItemId = itemId, ServerId = gs.Id, Price = 1100, SoldAt = now.AddHours(-2), SellerName = "S", BuyerName = "B", StackSize = 1, ObservedAt = now });
            db.AuctionSales.Add(new AuctionSale { ItemId = itemId, ServerId = gs.Id, Price = 5000, SoldAt = now.AddHours(-3), SellerName = "S", BuyerName = "B", StackSize = 12, ObservedAt = now });
            await db.SaveChangesAsync();
        }

        // Default / stack=false → only the 2 single sales.
        var singles = await _client.GetFromJsonAsync<PricesDto>($"/api/items/{itemId}/prices?server=Siren&days=0&stack=false");
        Assert.Equal(2, singles!.TotalCount);

        // stack=true → only the 1 stack sale; its median is the stack price, not mixed with singles.
        var stacks = await _client.GetFromJsonAsync<PricesDto>($"/api/items/{itemId}/prices?server=Siren&days=0&stack=true");
        Assert.Equal(1, stacks!.TotalCount);
        Assert.Equal(5000, stacks.Stats!.Median);
    }

    [Fact]
    public async Task Prices_ReturnsOnAhQuantity_FromScrapeState_ScopedToStackVariant()
    {
        const int itemId = 6300;
        var asOf = DateTimeOffset.UtcNow.AddMinutes(-5);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            db.GameItems.Add(new GameItem { ItemId = itemId, Name = "Crystal", StackSize = 12, Flags = 0, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
            var gs = new GameServer { Name = "Siren", Status = ServerStatus.Online, LastCheckedAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow };
            db.GameServers.Add(gs);
            await db.SaveChangesAsync();

            // Distinct on-AH counts for the single vs stack variant, captured at last scrape.
            db.AhScrapeStates.Add(new AhScrapeState { ItemId = itemId, ServerId = gs.Id, Stack = false, LastQuantity = 8, LastScrapedAt = asOf });
            db.AhScrapeStates.Add(new AhScrapeState { ItemId = itemId, ServerId = gs.Id, Stack = true, LastQuantity = 3, LastScrapedAt = asOf });
            await db.SaveChangesAsync();
        }

        var singles = await _client.GetFromJsonAsync<PricesOnAhDto>($"/api/items/{itemId}/prices?server=Siren&days=0&stack=false");
        Assert.Equal(8, singles!.OnAh);                       // single-variant count
        Assert.NotNull(singles.OnAhAsOf);

        var stacks = await _client.GetFromJsonAsync<PricesOnAhDto>($"/api/items/{itemId}/prices?server=Siren&days=0&stack=true");
        Assert.Equal(3, stacks!.OnAh);                        // stack-variant count, not mixed with singles
    }

    [Fact]
    public async Task CrossServer_ExcludesDisabledWorlds_EvenWithHistoricalData()
    {
        const int itemId = 4096;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            // Migration seeds ScraperSettings Id=1 (MasterEnabled=false); update to enabled.
            var setting = await db.ScraperSettings.FindAsync(1);
            if (setting is null)
                db.ScraperSettings.Add(new ScraperSetting { Id = 1, MasterEnabled = true, UpdatedAt = DateTimeOffset.UtcNow });
            else
            {
                setting.MasterEnabled = true;
                setting.UpdatedAt = DateTimeOffset.UtcNow;
            }
            db.GameItems.Add(new GameItem { ItemId = itemId, Name = "Fire Crystal", StackSize = 12, Flags = 0, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });

            var enabled = new GameServer { Name = "Siren", Status = ServerStatus.Online, LastCheckedAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow, ScrapeEnabled = true, SearchHost = "1.2.3.4", SearchPort = 54002 };
            var disabled = new GameServer { Name = "Asura", Status = ServerStatus.Online, LastCheckedAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow, ScrapeEnabled = false };
            db.GameServers.AddRange(enabled, disabled);
            await db.SaveChangesAsync();

            var now = DateTimeOffset.UtcNow;
            db.AuctionSales.Add(new AuctionSale { ItemId = itemId, ServerId = enabled.Id, Price = 1000, SoldAt = now, SellerName = "S", BuyerName = "B", StackSize = 1, ObservedAt = now });
            db.AuctionSales.Add(new AuctionSale { ItemId = itemId, ServerId = disabled.Id, Price = 9999, SoldAt = now, SellerName = "S", BuyerName = "B", StackSize = 1, ObservedAt = now });
            await db.SaveChangesAsync();
        }

        var body = await _client.GetFromJsonAsync<CrossServerDto>($"/api/items/{itemId}/prices/all?days=30");
        Assert.NotNull(body);
        Assert.Single(body!.Servers);
        Assert.Equal("Siren", body.Servers[0].Server);
    }
}
