using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Testcontainers.MsSql;
using Soverance.Auth.DTOs;
using Vanalytics.Core.DTOs.Characters;
using Vanalytics.Core.DTOs.Keys;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Api.Tests.Controllers;

public class SellAdviceTests : IAsyncLifetime
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

    private HttpRequestMessage Authed(HttpMethod method, string url, string token)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return req;
    }

    // Creates a user, logs in, generates an API key, syncs to auto-create a character
    // on the given server, and returns the token + character id.
    private async Task<(string Token, Guid CharacterId)> SetupCharacterAsync(
        string email, string username, string charName, string server)
    {
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            db.Users.Add(new Soverance.Auth.Models.User
            {
                Id = Guid.NewGuid(),
                Email = email,
                Username = username,
                PasswordHash = Soverance.Auth.Services.PasswordHasher.HashPassword("Password123!"),
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
        }

        var loginResp = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest { Email = email, Password = "Password123!" });
        var token = (await loginResp.Content.ReadFromJsonAsync<AuthResponse>())!.AccessToken;

        var keyResp = await _client.SendAsync(Authed(HttpMethod.Post, "/api/keys/generate", token));
        var apiKey = (await keyResp.Content.ReadFromJsonAsync<ApiKeyResponse>())!;

        var syncReq = new HttpRequestMessage(HttpMethod.Post, "/api/sync");
        syncReq.Headers.Add("X-Api-Key", apiKey.ApiKey);
        syncReq.Content = JsonContent.Create(new SyncRequest
        {
            CharacterName = charName,
            Server = server,
            ActiveJob = "WAR",
            ActiveJobLevel = 75,
            Jobs = [new SyncJobEntry { Job = "WAR", Level = 75 }]
        });
        await _client.SendAsync(syncReq);

        var listResp = await _client.SendAsync(Authed(HttpMethod.Get, "/api/characters", token));
        var chars = (await listResp.Content.ReadFromJsonAsync<List<CharacterSummaryResponse>>())!;
        return (token, chars.First(c => c.Name == charName).Id);
    }

    [Fact]
    public async Task SellAdvice_IncludesVendorAndAhItems_ComputesMedians()
    {
        var (token, charId) = await SetupCharacterAsync("sa1@test.com", "sa1user", "AdviceOne", "Asura");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var now = DateTimeOffset.UtcNow;

            var gs = new GameServer { Name = "Asura", Status = ServerStatus.Online, LastCheckedAt = now, CreatedAt = now };
            db.GameServers.Add(gs);

            // 5000 = vendorable + auctionable (both). 5001 = auctionable only (BaseSell 0).
            // 5002 = vendorable only, NoAuction (0x0040). 5003 = neither (excluded).
            db.GameItems.AddRange(
                new GameItem { ItemId = 5000, Name = "Both", StackSize = 12, Flags = 0, BaseSell = 100, CreatedAt = now, UpdatedAt = now },
                new GameItem { ItemId = 5001, Name = "AhOnly", StackSize = 1, Flags = 0, BaseSell = 0, CreatedAt = now, UpdatedAt = now },
                new GameItem { ItemId = 5002, Name = "VendorOnly", StackSize = 1, Flags = 0x0040, BaseSell = 500, CreatedAt = now, UpdatedAt = now },
                new GameItem { ItemId = 5003, Name = "Neither", StackSize = 1, Flags = 0x0040, BaseSell = 0, CreatedAt = now, UpdatedAt = now });
            await db.SaveChangesAsync();

            db.CharacterInventories.AddRange(
                new CharacterInventory { CharacterId = charId, ItemId = 5000, Bag = InventoryBag.Inventory, SlotIndex = 1, Quantity = 12, LastSeenAt = now },
                new CharacterInventory { CharacterId = charId, ItemId = 5001, Bag = InventoryBag.Inventory, SlotIndex = 2, Quantity = 3, LastSeenAt = now },
                new CharacterInventory { CharacterId = charId, ItemId = 5002, Bag = InventoryBag.Inventory, SlotIndex = 3, Quantity = 1, LastSeenAt = now },
                new CharacterInventory { CharacterId = charId, ItemId = 5003, Bag = InventoryBag.Inventory, SlotIndex = 4, Quantity = 1, LastSeenAt = now });

            // Item 5000: single sales median = 2000, stack sale = 30000. One 40-day-old sale must be excluded.
            db.AuctionSales.AddRange(
                new AuctionSale { ItemId = 5000, ServerId = gs.Id, Price = 1000, SoldAt = now.AddDays(-1), SellerName = "S", BuyerName = "B", StackSize = 1, ObservedAt = now },
                new AuctionSale { ItemId = 5000, ServerId = gs.Id, Price = 2000, SoldAt = now.AddDays(-2), SellerName = "S", BuyerName = "B", StackSize = 1, ObservedAt = now },
                new AuctionSale { ItemId = 5000, ServerId = gs.Id, Price = 3000, SoldAt = now.AddDays(-3), SellerName = "S", BuyerName = "B", StackSize = 1, ObservedAt = now },
                new AuctionSale { ItemId = 5000, ServerId = gs.Id, Price = 30000, SoldAt = now.AddDays(-2), SellerName = "S", BuyerName = "B", StackSize = 12, ObservedAt = now },
                new AuctionSale { ItemId = 5000, ServerId = gs.Id, Price = 99999, SoldAt = now.AddDays(-40), SellerName = "S", BuyerName = "B", StackSize = 1, ObservedAt = now });
            await db.SaveChangesAsync();
        }

        var resp = await _client.SendAsync(Authed(HttpMethod.Get, $"/api/characters/{charId}/inventory/sell-advice", token));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = (await resp.Content.ReadFromJsonAsync<SellAdviceResponse>())!;

        Assert.Equal("Asura", body.ServerName);
        Assert.True(body.ServerScraped);
        // 5003 (neither vendorable nor auctionable) is excluded; the other three are present.
        Assert.Equal(3, body.Items.Count);
        Assert.DoesNotContain(body.Items, i => i.ItemId == 5003);

        var both = body.Items.Single(i => i.ItemId == 5000);
        Assert.Equal(2000, both.SingleMedian);      // median of 1000/2000/3000
        Assert.Equal(3, both.SingleCount);          // 40-day-old sale excluded
        Assert.Equal(30000, both.StackMedian);
        Assert.Equal(1, both.StackCount);
        Assert.Equal(100, both.BaseSell);
        Assert.False(both.IsNoAuction);

        var vendorOnly = body.Items.Single(i => i.ItemId == 5002);
        Assert.True(vendorOnly.IsNoAuction);
        Assert.Null(vendorOnly.SingleMedian);       // no sales
        Assert.Equal(0, vendorOnly.SingleCount);
    }

    [Fact]
    public async Task SellAdvice_UnscrapedWorld_ReturnsRowsWithNullMedians()
    {
        var (token, charId) = await SetupCharacterAsync("sa2@test.com", "sa2user", "AdviceTwo", "Ragnarok");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var now = DateTimeOffset.UtcNow;
            // No GameServer row named "Ragnarok" → serverScraped == false.
            db.GameItems.Add(new GameItem { ItemId = 5100, Name = "Thing", StackSize = 1, Flags = 0, BaseSell = 250, CreatedAt = now, UpdatedAt = now });
            await db.SaveChangesAsync();
            db.CharacterInventories.Add(new CharacterInventory { CharacterId = charId, ItemId = 5100, Bag = InventoryBag.Inventory, SlotIndex = 1, Quantity = 2, LastSeenAt = now });
            await db.SaveChangesAsync();
        }

        var resp = await _client.SendAsync(Authed(HttpMethod.Get, $"/api/characters/{charId}/inventory/sell-advice", token));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = (await resp.Content.ReadFromJsonAsync<SellAdviceResponse>())!;

        Assert.False(body.ServerScraped);
        var row = Assert.Single(body.Items);
        Assert.Equal(250, row.BaseSell);
        Assert.Null(row.SingleMedian);
        Assert.Null(row.StackMedian);
    }

    [Fact]
    public async Task SellAdvice_OtherUsersCharacter_IsForbidden()
    {
        var (_, charId) = await SetupCharacterAsync("sa3@test.com", "sa3user", "AdviceThree", "Asura");
        var (otherToken, _) = await SetupCharacterAsync("sa4@test.com", "sa4user", "Intruder", "Asura");

        var resp = await _client.SendAsync(Authed(HttpMethod.Get, $"/api/characters/{charId}/inventory/sell-advice", otherToken));
        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }
}
