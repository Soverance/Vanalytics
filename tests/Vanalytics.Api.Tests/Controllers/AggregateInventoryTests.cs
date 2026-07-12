using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Soverance.Auth.DTOs;
using Vanalytics.Core.DTOs.Inventory;
using Vanalytics.Core.DTOs.Keys;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Core.Models;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Api.Tests.Controllers;

public class AggregateInventoryTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
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

    private HttpRequestMessage SyncReq(string apiKey, SyncRequest payload)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/sync");
        req.Headers.Add("X-Api-Key", apiKey);
        req.Content = JsonContent.Create(payload);
        return req;
    }

    private HttpRequestMessage InvSyncReq(string apiKey, InventorySyncRequest payload)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/sync/inventory");
        req.Headers.Add("X-Api-Key", apiKey);
        req.Content = JsonContent.Create(payload);
        return req;
    }

    private async Task SeedItemsAsync(params (int Id, string Name, int Stack)[] items)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        foreach (var (id, name, stack) in items)
        {
            if (!await db.GameItems.AnyAsync(g => g.ItemId == id))
                db.GameItems.Add(new GameItem
                {
                    ItemId = id, Name = name, Category = "Usable", StackSize = stack,
                    IconPath = $"{id}.png", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow
                });
        }
        await db.SaveChangesAsync();
    }

    private async Task<AggregateInventoryResponse> GetAggregateAsync(string jwt)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, "/api/characters/inventory/aggregate");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", jwt);
        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        return (await resp.Content.ReadFromJsonAsync<AggregateInventoryResponse>())!;
    }

    private async Task<AggregateInventoryResponse> GetAggregateAsync(string jwt, string? world)
    {
        var url = world is null
            ? "/api/characters/inventory/aggregate"
            : $"/api/characters/inventory/aggregate?world={Uri.EscapeDataString(world)}";
        var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", jwt);
        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        return (await resp.Content.ReadFromJsonAsync<AggregateInventoryResponse>())!;
    }

    [Fact]
    public async Task Aggregate_GroupsItemAcrossCharacters_WithPerLocationBreakdown()
    {
        var (jwt, apiKey) = await SetupSyncUserAsync("agg1@test.com", "agg1user");
        await SeedItemsAsync((6001, "Beastblood", 12), (6002, "Iron Ore", 12));

        // Character A: 4x Beastblood in Inventory, 2x Iron Ore in Safe
        await _client.SendAsync(SyncReq(apiKey, new SyncRequest
        { CharacterName = "AggMain", Server = "Asura", ActiveJob = "THF", ActiveJobLevel = 99 }));
        await _client.SendAsync(InvSyncReq(apiKey, new InventorySyncRequest
        {
            CharacterName = "AggMain", Server = "Asura", FullSync = true,
            Changes =
            [
                new InventoryChangeEntry { ItemId = 6001, Bag = "Inventory", SlotIndex = 1, ChangeType = "Added", QuantityBefore = 0, QuantityAfter = 4 },
                new InventoryChangeEntry { ItemId = 6002, Bag = "Safe", SlotIndex = 1, ChangeType = "Added", QuantityBefore = 0, QuantityAfter = 2 },
            ]
        }));

        // Character B: 2x Beastblood in Safe
        await _client.SendAsync(SyncReq(apiKey, new SyncRequest
        { CharacterName = "AggMule", Server = "Asura", ActiveJob = "WHM", ActiveJobLevel = 99 }));
        await _client.SendAsync(InvSyncReq(apiKey, new InventorySyncRequest
        {
            CharacterName = "AggMule", Server = "Asura", FullSync = true,
            Changes =
            [
                new InventoryChangeEntry { ItemId = 6001, Bag = "Safe", SlotIndex = 1, ChangeType = "Added", QuantityBefore = 0, QuantityAfter = 2 },
            ]
        }));

        var result = await GetAggregateAsync(jwt);

        var beastblood = result.Items.Single(i => i.ItemId == 6001);
        Assert.Equal("Beastblood", beastblood.Name);
        Assert.Equal("6001.png", beastblood.IconPath);
        Assert.Equal(6, beastblood.TotalQuantity);
        Assert.Equal(2, beastblood.Locations.Count);
        Assert.Contains(beastblood.Locations, l => l.CharacterName == "AggMain" && l.Bag == "Inventory" && l.Quantity == 4);
        Assert.Contains(beastblood.Locations, l => l.CharacterName == "AggMule" && l.Bag == "Safe" && l.Quantity == 2);

        // Items sorted alphabetically: Beastblood before Iron Ore
        Assert.Equal(new[] { "Beastblood", "Iron Ore" }, result.Items.Select(i => i.Name).ToArray());

        // Totals
        Assert.Equal(2, result.Totals.CharacterCount);
        Assert.Equal(2, result.Totals.SyncedCharacterCount);
        Assert.Equal(2, result.Totals.DistinctItems);
        Assert.Equal(8, result.Totals.TotalQuantity);   // 4 + 2 + 2
        Assert.Equal(3, result.Totals.UsedSlots);        // 3 occupied slots total
        // AggMain has items in Inventory + Safe (2 active bags × 80 = 160)
        // AggMule has items in Safe (1 active bag × 80 = 80); total = 240
        Assert.Equal(240, result.Totals.UnlockedSlots);
    }

    [Fact]
    public async Task Aggregate_ExcludesOtherUsersCharacters()
    {
        var (jwtA, apiKeyA) = await SetupSyncUserAsync("agg2a@test.com", "agg2auser");
        var (_, apiKeyB) = await SetupSyncUserAsync("agg2b@test.com", "agg2buser");
        await SeedItemsAsync((6100, "Shared Name Item", 12));

        await _client.SendAsync(SyncReq(apiKeyB, new SyncRequest
        { CharacterName = "OtherUserChar", Server = "Asura", ActiveJob = "BLM", ActiveJobLevel = 99 }));
        await _client.SendAsync(InvSyncReq(apiKeyB, new InventorySyncRequest
        {
            CharacterName = "OtherUserChar", Server = "Asura", FullSync = true,
            Changes = [ new InventoryChangeEntry { ItemId = 6100, Bag = "Inventory", SlotIndex = 1, ChangeType = "Added", QuantityBefore = 0, QuantityAfter = 9 } ]
        }));

        var result = await GetAggregateAsync(jwtA);

        Assert.Empty(result.Items);
        Assert.Equal(0, result.Totals.CharacterCount);
        Assert.Equal(0, result.Totals.TotalQuantity);
    }

    [Fact]
    public async Task Aggregate_CountsUnsyncedCharacterSeparately()
    {
        var (jwt, apiKey) = await SetupSyncUserAsync("agg3@test.com", "agg3user");
        // Character exists (base sync) but never synced inventory.
        await _client.SendAsync(SyncReq(apiKey, new SyncRequest
        { CharacterName = "AggNoInv", Server = "Asura", ActiveJob = "RDM", ActiveJobLevel = 99 }));

        var result = await GetAggregateAsync(jwt);

        Assert.Equal(1, result.Totals.CharacterCount);
        Assert.Equal(0, result.Totals.SyncedCharacterCount);
        Assert.Empty(result.Items);
        Assert.Single(result.Characters);
        Assert.Equal("AggNoInv", result.Characters[0].Name);
    }

    [Fact]
    public async Task Aggregate_DeduplicatesLocationsByCharacterAndBag_WhenItemOccupiesMultipleSlots()
    {
        var (jwt, apiKey) = await SetupSyncUserAsync("aggdup@test.com", "aggdupuser");
        await SeedItemsAsync((6200, "Stack Item", 12));

        // One character with same item in two slots of the same bag (partial stacks).
        await _client.SendAsync(SyncReq(apiKey, new SyncRequest
        { CharacterName = "AggDupChar", Server = "Asura", ActiveJob = "WAR", ActiveJobLevel = 99 }));
        await _client.SendAsync(InvSyncReq(apiKey, new InventorySyncRequest
        {
            CharacterName = "AggDupChar", Server = "Asura", FullSync = true,
            Changes =
            [
                new InventoryChangeEntry { ItemId = 6200, Bag = "Inventory", SlotIndex = 1, ChangeType = "Added", QuantityBefore = 0, QuantityAfter = 12 },
                new InventoryChangeEntry { ItemId = 6200, Bag = "Inventory", SlotIndex = 2, ChangeType = "Added", QuantityBefore = 0, QuantityAfter = 5 },
            ]
        }));

        var result = await GetAggregateAsync(jwt);

        var item = result.Items.Single(i => i.ItemId == 6200);
        // Locations must be deduped: one entry per (character, bag), not per slot.
        var location = Assert.Single(item.Locations);
        Assert.Equal("AggDupChar", location.CharacterName);
        Assert.Equal("Inventory", location.Bag);
        Assert.Equal(17, location.Quantity);   // 12 + 5 summed

        // Totals: slots count individual rows, quantity is the sum.
        Assert.Equal(2, result.Totals.UsedSlots);
        Assert.Equal(17, result.Totals.TotalQuantity);
    }

    [Fact]
    public async Task Aggregate_ScopesToSelectedWorld_AndListsAvailableWorlds()
    {
        var (jwt, apiKey) = await SetupSyncUserAsync("aggw1@test.com", "aggw1user");
        await SeedItemsAsync((7001, "Asura Item", 12), (7002, "Bahamut Item", 12));

        await _client.SendAsync(SyncReq(apiKey, new SyncRequest
        { CharacterName = "AsuraChar", Server = "Asura", ActiveJob = "THF", ActiveJobLevel = 99 }));
        await _client.SendAsync(InvSyncReq(apiKey, new InventorySyncRequest
        {
            CharacterName = "AsuraChar", Server = "Asura", FullSync = true,
            Changes = [ new InventoryChangeEntry { ItemId = 7001, Bag = "Inventory", SlotIndex = 1, ChangeType = "Added", QuantityBefore = 0, QuantityAfter = 3 } ]
        }));
        await _client.SendAsync(SyncReq(apiKey, new SyncRequest
        { CharacterName = "BahaChar", Server = "Bahamut", ActiveJob = "WHM", ActiveJobLevel = 99 }));
        await _client.SendAsync(InvSyncReq(apiKey, new InventorySyncRequest
        {
            CharacterName = "BahaChar", Server = "Bahamut", FullSync = true,
            Changes = [ new InventoryChangeEntry { ItemId = 7002, Bag = "Inventory", SlotIndex = 1, ChangeType = "Added", QuantityBefore = 0, QuantityAfter = 5 } ]
        }));

        var asura = await GetAggregateAsync(jwt, "Asura");
        Assert.Equal("Asura", asura.World);
        Assert.Equal(new[] { "Asura", "Bahamut" }, asura.AvailableWorlds.OrderBy(w => w).ToArray());
        Assert.Single(asura.Items);
        Assert.Equal(7001, asura.Items[0].ItemId);   // Bahamut item excluded

        var baha = await GetAggregateAsync(jwt, "Bahamut");
        Assert.Equal("Bahamut", baha.World);
        Assert.Single(baha.Items);
        Assert.Equal(7002, baha.Items[0].ItemId);
    }

    [Fact]
    public async Task Aggregate_ProjectsRareExFlags()
    {
        var (jwt, apiKey) = await SetupSyncUserAsync("aggw2@test.com", "aggw2user");
        // Flags 0x8000 = Rare, 0x4000 = Exclusive → Rare/Ex item.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            db.GameItems.Add(new GameItem
            {
                ItemId = 7100, Name = "Rare Ex Thing", Category = "Armor", StackSize = 1,
                Flags = 0x8000 | 0x4000, IconPath = "7100.png",
                CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
        }
        await _client.SendAsync(SyncReq(apiKey, new SyncRequest
        { CharacterName = "FlagChar", Server = "Asura", ActiveJob = "THF", ActiveJobLevel = 99 }));
        await _client.SendAsync(InvSyncReq(apiKey, new InventorySyncRequest
        {
            CharacterName = "FlagChar", Server = "Asura", FullSync = true,
            Changes = [ new InventoryChangeEntry { ItemId = 7100, Bag = "Inventory", SlotIndex = 1, ChangeType = "Added", QuantityBefore = 0, QuantityAfter = 1 } ]
        }));

        var result = await GetAggregateAsync(jwt, "Asura");
        var item = result.Items.Single(i => i.ItemId == 7100);
        Assert.True(item.IsRare);
        Assert.True(item.IsExclusive);
    }
}
