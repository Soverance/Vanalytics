using System.Net;
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

public class ItemsPriceHistoryTests : IAsyncLifetime
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

    private record PointDto(DateTimeOffset T, int Median, int Count);
    private record HistoryDto(string Bucket, List<PointDto> Points);

    private async Task<int> SeedItemAndServerAsync(int itemId, string world)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        db.GameItems.Add(new GameItem { ItemId = itemId, Name = "Item", StackSize = 1, Flags = 0, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        var gs = new GameServer { Name = world, Status = ServerStatus.Online, LastCheckedAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow };
        db.GameServers.Add(gs);
        await db.SaveChangesAsync();
        return gs.Id;
    }

    private async Task AddSaleAsync(int itemId, int serverId, int price, DateTimeOffset soldAt)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        db.AuctionSales.Add(new AuctionSale { ItemId = itemId, ServerId = serverId, Price = price, SoldAt = soldAt, SellerName = "S", BuyerName = "B", StackSize = 1, ObservedAt = soldAt });
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task History_DailyBuckets_MedianPerDay()
    {
        const int itemId = 5000;
        var serverId = await SeedItemAndServerAsync(itemId, "Siren");
        var now = DateTimeOffset.UtcNow;
        // Two sales on the same recent day → one bucket, median of the two.
        await AddSaleAsync(itemId, serverId, 100, now.AddDays(-1).AddHours(1));
        await AddSaleAsync(itemId, serverId, 300, now.AddDays(-1).AddHours(5));
        // One sale on a different recent day → its own bucket.
        await AddSaleAsync(itemId, serverId, 500, now.AddDays(-2));

        var body = await _client.GetFromJsonAsync<HistoryDto>($"/api/items/{itemId}/prices/history?server=Siren&days=30");
        Assert.NotNull(body);
        Assert.Equal("day", body!.Bucket);
        Assert.Equal(2, body.Points.Count);
        Assert.True(body.Points[0].T < body.Points[1].T);          // ascending
        Assert.Equal(500, body.Points[0].Median);                  // day -2 bucket
        Assert.Equal(1, body.Points[0].Count);
        Assert.Equal(200, body.Points[1].Median);                  // day -1 bucket: median(100,300)=200
        Assert.Equal(2, body.Points[1].Count);
    }

    [Fact]
    public async Task History_AllTime_UsesMonthBuckets_AndIgnoresDateCutoff()
    {
        const int itemId = 5001;
        var serverId = await SeedItemAndServerAsync(itemId, "Asura");
        var now = DateTimeOffset.UtcNow;
        await AddSaleAsync(itemId, serverId, 50, now.AddDays(-400));   // >1y old — would be excluded by any windowed query
        await AddSaleAsync(itemId, serverId, 70, now.AddDays(-10));

        var body = await _client.GetFromJsonAsync<HistoryDto>($"/api/items/{itemId}/prices/history?server=Asura&days=0");
        Assert.NotNull(body);
        Assert.Equal("month", body!.Bucket);
        Assert.Equal(2, body.Points.Sum(p => p.Count));               // both sales present (no cutoff)
    }

    [Fact]
    public async Task History_UnknownServer_Returns400()
    {
        const int itemId = 5002;
        await SeedItemAndServerAsync(itemId, "Bahamut");
        var resp = await _client.GetAsync($"/api/items/{itemId}/prices/history?server=Nope&days=30");
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }
}
