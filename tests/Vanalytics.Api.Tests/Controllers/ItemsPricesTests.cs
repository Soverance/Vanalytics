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
