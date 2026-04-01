using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class ItemsRandomControllerTests : IAsyncLifetime
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
                });
                builder.ConfigureAppConfiguration((_, config) =>
                {
                    config.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Jwt:Secret"] = "TestSecretKeyThatIsAtLeast32BytesLongForHmacSha256!!",
                        ["Jwt:Issuer"] = "VanalyticsTest",
                        ["Jwt:Audience"] = "VanalyticsTest",
                        ["Jwt:AccessTokenExpirationMinutes"] = "15",
                        ["Jwt:RefreshTokenExpirationDays"] = "7"
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

    private async Task SeedItemsAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        await db.Database.EnsureCreatedAsync();

        db.GameItems.AddRange(
            new GameItem { ItemId = 1, Name = "Bronze Sword", Category = "Weapons", SubCategory = "Swords", Flags = 0, StackSize = 1, Level = 1 },
            new GameItem { ItemId = 2, Name = "Bronze Cap", Category = "Armor", SubCategory = "Head", Flags = 0, StackSize = 1, Level = 1 },
            new GameItem { ItemId = 3, Name = "Fire Crystal", Category = "Crystals", Flags = 0, StackSize = 12 },
            new GameItem { ItemId = 4, Name = "Potion", Category = "Medicines", Flags = 0, StackSize = 12 },
            new GameItem { ItemId = 5, Name = "Rolanberry", Category = "Food", Flags = 0, StackSize = 12 },
            new GameItem { ItemId = 6, Name = "Iron Ore", Category = "Materials", Flags = 0, StackSize = 12 },
            new GameItem { ItemId = 7, Name = "Mythril Sword", Category = "Weapons", SubCategory = "Swords", Flags = 0, StackSize = 1, Level = 40 }
        );
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Random_ReturnsSpotlightAndSupporting()
    {
        await SeedItemsAsync();

        var response = await _client.GetAsync("/api/items/random?count=6");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        var spotlight = json.GetProperty("spotlight");
        var supporting = json.GetProperty("supporting");

        var spotlightCategory = spotlight.GetProperty("category").GetString();
        Assert.True(spotlightCategory == "Weapons" || spotlightCategory == "Armor",
            $"Spotlight category was '{spotlightCategory}', expected Weapons or Armor");

        Assert.True(spotlight.TryGetProperty("name", out _));
        Assert.True(spotlight.TryGetProperty("description", out _));
        Assert.True(spotlight.TryGetProperty("jobs", out _));
        Assert.True(spotlight.TryGetProperty("flags", out _));

        Assert.Equal(5, supporting.GetArrayLength());
    }

    [Fact]
    public async Task Random_DefaultCountIs6()
    {
        await SeedItemsAsync();

        var response = await _client.GetAsync("/api/items/random");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(5, json.GetProperty("supporting").GetArrayLength());
    }
}
