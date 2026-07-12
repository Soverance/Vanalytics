using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
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

public class InventoryCapacityTests : IAsyncLifetime
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

    private async Task<(string JwtToken, string ApiKey)> SetupSyncUserAsync(string email, string username)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var user = new Soverance.Auth.Models.User
        {
            Id = Guid.NewGuid(), Email = email, Username = username,
            PasswordHash = Soverance.Auth.Services.PasswordHasher.HashPassword("Password123!"),
            CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var loginResp = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest { Email = email, Password = "Password123!" });
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

    private async Task<Guid> CharacterIdAsync(string name)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        return (await db.Characters.FirstAsync(c => c.Name == name)).Id;
    }

    [Fact]
    public async Task GetCapacities_AfterSync_ReturnsStoredMap()
    {
        var (jwt, apiKey) = await SetupSyncUserAsync("invcap3@test.com", "invcap3user");
        await _client.SendAsync(CreateSyncRequest(apiKey, new SyncRequest
        { CharacterName = "InvCapChar3", Server = "Asura", ActiveJob = "THF", ActiveJobLevel = 99 }));
        await _client.SendAsync(CreateInventorySyncRequest(apiKey, new InventorySyncRequest
        {
            CharacterName = "InvCapChar3", Server = "Asura", FullSync = true, Changes = [],
            BagCapacities = new Dictionary<string, int> { ["Inventory"] = 35, ["Safe"] = 50 }
        }));
        var charId = await CharacterIdAsync("InvCapChar3");

        var req = new HttpRequestMessage(HttpMethod.Get, $"/api/characters/{charId}/inventory/capacities");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", jwt);
        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var map = (await resp.Content.ReadFromJsonAsync<Dictionary<string, int>>())!;
        Assert.Equal(35, map["Inventory"]);
        Assert.Equal(50, map["Safe"]);
    }

    [Fact]
    public async Task GetCapacities_NoData_ReturnsEmptyMap()
    {
        var (jwt, apiKey) = await SetupSyncUserAsync("invcap4@test.com", "invcap4user");
        await _client.SendAsync(CreateSyncRequest(apiKey, new SyncRequest
        { CharacterName = "InvCapChar4", Server = "Asura", ActiveJob = "THF", ActiveJobLevel = 99 }));
        var charId = await CharacterIdAsync("InvCapChar4");

        var req = new HttpRequestMessage(HttpMethod.Get, $"/api/characters/{charId}/inventory/capacities");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", jwt);
        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var map = (await resp.Content.ReadFromJsonAsync<Dictionary<string, int>>())!;
        Assert.Empty(map);
    }

    [Fact]
    public async Task InventorySync_WithBagCapacities_PersistsJson()
    {
        var (_, apiKey) = await SetupSyncUserAsync("invcap1@test.com", "invcap1user");

        await _client.SendAsync(CreateSyncRequest(apiKey, new SyncRequest
        { CharacterName = "InvCapChar", Server = "Asura", ActiveJob = "THF", ActiveJobLevel = 99 }));

        var resp = await _client.SendAsync(CreateInventorySyncRequest(apiKey, new InventorySyncRequest
        {
            CharacterName = "InvCapChar", Server = "Asura", FullSync = true,
            Changes = [],
            BagCapacities = new Dictionary<string, int> { ["Inventory"] = 30, ["Wardrobe"] = 80 }
        }));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var character = await db.Characters.SingleAsync(c => c.Name == "InvCapChar");
        Assert.NotNull(character.BagCapacitiesJson);
        var map = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, int>>(character.BagCapacitiesJson!)!;
        Assert.Equal(30, map["Inventory"]);
        Assert.Equal(80, map["Wardrobe"]);
    }

    [Fact]
    public async Task InventorySync_WithoutBagCapacities_LeavesJsonNull()
    {
        var (_, apiKey) = await SetupSyncUserAsync("invcap2@test.com", "invcap2user");

        await _client.SendAsync(CreateSyncRequest(apiKey, new SyncRequest
        { CharacterName = "InvCapChar2", Server = "Asura", ActiveJob = "THF", ActiveJobLevel = 99 }));

        var resp = await _client.SendAsync(CreateInventorySyncRequest(apiKey, new InventorySyncRequest
        {
            CharacterName = "InvCapChar2", Server = "Asura", FullSync = true, Changes = []
            // no BagCapacities
        }));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var character = await db.Characters.SingleAsync(c => c.Name == "InvCapChar2");
        Assert.Null(character.BagCapacitiesJson);
    }

    [Fact]
    public async Task Anomalies_NearCapacity_UsesRealCapacity()
    {
        var (jwt, apiKey) = await SetupSyncUserAsync("invcap5@test.com", "invcap5user");
        await _client.SendAsync(CreateSyncRequest(apiKey, new SyncRequest
        { CharacterName = "InvCapChar5", Server = "Asura", ActiveJob = "THF", ActiveJobLevel = 99 }));

        // Seed 32 catalog items (ids 5000..5031) so the anomalies join succeeds.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            for (int i = 0; i < 32; i++)
            {
                db.GameItems.Add(new Vanalytics.Core.Models.GameItem
                {
                    ItemId = 5000 + i, Name = $"Filler {i}", Category = "Usable", StackSize = 1,
                    CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow
                });
            }
            await db.SaveChangesAsync();
        }

        // Capacity: Inventory unlocked to 35 slots.
        await _client.SendAsync(CreateInventorySyncRequest(apiKey, new InventorySyncRequest
        {
            CharacterName = "InvCapChar5", Server = "Asura", FullSync = true,
            BagCapacities = new Dictionary<string, int> { ["Inventory"] = 35 },
            Changes = Enumerable.Range(0, 32).Select(i => new InventoryChangeEntry
            {
                ItemId = 5000 + i, Bag = "Inventory", SlotIndex = i + 1,
                ChangeType = "Added", QuantityBefore = 0, QuantityAfter = 1
            }).ToList()
        }));

        var charId = await CharacterIdAsync("InvCapChar5");
        var req = new HttpRequestMessage(HttpMethod.Get, $"/api/characters/{charId}/inventory/anomalies");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", jwt);
        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var json = await resp.Content.ReadAsStringAsync();
        using var doc = System.Text.Json.JsonDocument.Parse(json);
        var anomalies = doc.RootElement.GetProperty("anomalies");
        var near = anomalies.EnumerateArray()
            .Where(a => a.GetProperty("type").GetString() == "nearCapacity")
            .ToList();
        Assert.Single(near);
        var details = near[0].GetProperty("details");
        Assert.Equal("Inventory", details.GetProperty("bagName").GetString());
        Assert.Equal(32, details.GetProperty("usedSlots").GetInt32());
        Assert.Equal(35, details.GetProperty("maxSlots").GetInt32());
    }
}
