using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Testcontainers.MsSql;
using Vanalytics.Core.Models;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Api.Tests.Controllers;

public class EconomyReadTests : IAsyncLifetime
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
        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _container.DisposeAsync();
    }

    [Fact]
    public async Task GetAhHistory_ReturnsRecentSalesNewestFirst()
    {
        using (var scope = _factory.Services.CreateScope())
        {
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
                StackSize = 1,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync();

            // Use the identity-assigned server Id for AuctionSale FK
            db.AuctionSales.Add(new AuctionSale
            {
                ItemId = 4096,
                ServerId = server.Id,
                Price = 100,
                SoldAt = DateTimeOffset.FromUnixTimeSeconds(1000),
                SellerName = "S",
                BuyerName = "B",
                StackSize = 1,
                ObservedAt = DateTimeOffset.UtcNow,
            });
            db.AuctionSales.Add(new AuctionSale
            {
                ItemId = 4096,
                ServerId = server.Id,
                Price = 200,
                SoldAt = DateTimeOffset.FromUnixTimeSeconds(2000),
                SellerName = "S",
                BuyerName = "B",
                StackSize = 1,
                ObservedAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        var resp = await _client.GetAsync("/api/economy/ah/4096?server=Asura");
        resp.EnsureSuccessStatusCode();
        var body = await resp.Content.ReadFromJsonAsync<AhReadResponse>();
        Assert.Equal(200, body!.Single.LatestPrice);
        Assert.Equal(2, body.Single.Sales.Count);
        Assert.Equal(200, body.Single.Sales[0].Price); // newest first
    }

    private record AhReadResponse(int ItemId, string Server, AhSide Single, AhSide Stack);
    private record AhSide(int? LatestPrice, List<AhSaleDto> Sales);
    private record AhSaleDto(int Price, DateTimeOffset SoldAt, string SellerName, string BuyerName, int StackSize);
}
