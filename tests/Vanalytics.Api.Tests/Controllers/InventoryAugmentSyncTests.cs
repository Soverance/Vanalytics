using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Soverance.Auth.DTOs;
using Vanalytics.Core.DTOs.Keys;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class InventoryAugmentSyncTests : IAsyncLifetime
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

    private async Task<(string JwtToken, string ApiKey)> SetupSyncUserAsync(
        string email, string username)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var user = new Soverance.Auth.Models.User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Username = username,
            PasswordHash = Soverance.Auth.Services.PasswordHasher.HashPassword("Password123!"),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var loginResp = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest
        { Email = email, Password = "Password123!" });
        var auth = (await loginResp.Content.ReadFromJsonAsync<AuthResponse>())!;

        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        var keyResp = await _client.SendAsync(keyReq);
        var apiKey = (await keyResp.Content.ReadFromJsonAsync<ApiKeyResponse>())!;

        return (auth.AccessToken, apiKey.ApiKey);
    }

    private HttpRequestMessage CreateSyncRequest(string apiKey, SyncRequest payload)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/sync");
        req.Headers.Add("X-Api-Key", apiKey);
        req.Content = JsonContent.Create(payload);
        return req;
    }

    private HttpRequestMessage CreateInventorySyncRequest(string apiKey, InventorySyncRequest payload)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/sync/inventory");
        req.Headers.Add("X-Api-Key", apiKey);
        req.Content = JsonContent.Create(payload);
        return req;
    }

    [Fact]
    public async Task InventorySync_AddedAndAugmentsChanged_PersistAugments()
    {
        var (_, apiKey) = await SetupSyncUserAsync("invaug@test.com", "invauguser");

        // Character must exist first (inventory sync 404s otherwise).
        await _client.SendAsync(CreateSyncRequest(apiKey, new SyncRequest
        {
            CharacterName = "InvAugChar", Server = "Asura",
            ActiveJob = "THF", ActiveJobLevel = 99
        }));

        // Full sync: one augmented item added.
        await _client.SendAsync(CreateInventorySyncRequest(apiKey, new InventorySyncRequest
        {
            CharacterName = "InvAugChar", Server = "Asura", FullSync = true,
            Changes =
            [
                new InventoryChangeEntry
                {
                    ItemId = 26252, Bag = "Wardrobe", SlotIndex = 3,
                    ChangeType = "Added", QuantityBefore = 0, QuantityAfter = 1,
                    Augments = ["DEX+9", "Weapon skill damage +8%"]
                }
            ]
        }));

        // Re-augment in place: same item, same slot, new augments.
        var resp = await _client.SendAsync(CreateInventorySyncRequest(apiKey, new InventorySyncRequest
        {
            CharacterName = "InvAugChar", Server = "Asura", FullSync = false,
            Changes =
            [
                new InventoryChangeEntry
                {
                    ItemId = 26252, Bag = "Wardrobe", SlotIndex = 3,
                    ChangeType = "AugmentsChanged", QuantityBefore = 1, QuantityAfter = 1,
                    Augments = ["DEX+20", "Accuracy+20 Attack+20", "Weapon skill damage +10%"]
                }
            ]
        }));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var row = await db.CharacterInventories
            .Where(ci => ci.Character.Name == "InvAugChar" && ci.ItemId == 26252)
            .SingleAsync();
        var augs = System.Text.Json.JsonSerializer.Deserialize<List<string>>(row.AugmentsJson!);
        Assert.Equal(new[] { "DEX+20", "Accuracy+20 Attack+20", "Weapon skill damage +10%" }, augs);
    }

    [Fact]
    public async Task GetInventory_ExposesAugments()
    {
        var (jwt, apiKey) = await SetupSyncUserAsync("invaug2@test.com", "invaug2user");

        await _client.SendAsync(CreateSyncRequest(apiKey, new SyncRequest
        {
            CharacterName = "InvAugChar2", Server = "Asura",
            ActiveJob = "THF", ActiveJobLevel = 99
        }));

        Guid charId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            // GetInventory inner-joins GameItems, so the item must exist in the catalog.
            db.GameItems.Add(new Vanalytics.Core.Models.GameItem
            {
                ItemId = 26252,
                Name = "Toutatis's Cape",
                Category = "Armor",
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
            charId = (await db.Characters.FirstAsync(c => c.Name == "InvAugChar2")).Id;
        }

        await _client.SendAsync(CreateInventorySyncRequest(apiKey, new InventorySyncRequest
        {
            CharacterName = "InvAugChar2", Server = "Asura", FullSync = true,
            Changes =
            [
                new InventoryChangeEntry
                {
                    ItemId = 26252, Bag = "Wardrobe", SlotIndex = 1,
                    ChangeType = "Added", QuantityBefore = 0, QuantityAfter = 1,
                    Augments = ["DEX+9", "Weapon skill damage +8%"]
                }
            ]
        }));

        var req = new HttpRequestMessage(HttpMethod.Get, $"/api/characters/{charId}/inventory");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", jwt);
        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var byBag = (await resp.Content.ReadFromJsonAsync<Dictionary<string, List<InventoryAugDto>>>())!;
        var item = byBag["Wardrobe"].Single(i => i.ItemId == 26252);
        Assert.Equal(new[] { "DEX+9", "Weapon skill damage +8%" }, item.Augments);
    }

    [Fact]
    public async Task GetInventory_ItemWithoutAugments_ReturnsEmptyArray()
    {
        var (jwt, apiKey) = await SetupSyncUserAsync("invaug3@test.com", "invaug3user");

        await _client.SendAsync(CreateSyncRequest(apiKey, new SyncRequest
        {
            CharacterName = "InvAugChar3", Server = "Asura",
            ActiveJob = "THF", ActiveJobLevel = 99
        }));

        Guid charId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            db.GameItems.Add(new Vanalytics.Core.Models.GameItem
            {
                ItemId = 4096,
                Name = "Vile Elixir",
                Category = "Usable",
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
            charId = (await db.Characters.FirstAsync(c => c.Name == "InvAugChar3")).Id;
        }

        await _client.SendAsync(CreateInventorySyncRequest(apiKey, new InventorySyncRequest
        {
            CharacterName = "InvAugChar3", Server = "Asura", FullSync = true,
            Changes =
            [
                new InventoryChangeEntry
                {
                    ItemId = 4096, Bag = "Inventory", SlotIndex = 1,
                    ChangeType = "Added", QuantityBefore = 0, QuantityAfter = 12
                    // no Augments
                }
            ]
        }));

        var req = new HttpRequestMessage(HttpMethod.Get, $"/api/characters/{charId}/inventory");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", jwt);
        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var byBag = (await resp.Content.ReadFromJsonAsync<Dictionary<string, List<InventoryAugDto>>>())!;
        var item = byBag["Inventory"].Single(i => i.ItemId == 4096);
        Assert.NotNull(item.Augments);
        Assert.Empty(item.Augments);
    }

    private class InventoryAugDto
    {
        public int ItemId { get; set; }
        public List<string> Augments { get; set; } = [];
    }
}
