using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Soverance.Auth.DTOs;
using Vanalytics.Core.DTOs.GearSets;
using Vanalytics.Core.DTOs.Keys;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class GearSetHealthCountsTests : IAsyncLifetime
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

    private async Task<(string Token, string ApiKey, Guid CharacterId)> SetupUserWithCharacterAsync(
        string email, string username, string charName)
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

        var syncReq = new HttpRequestMessage(HttpMethod.Post, "/api/sync");
        syncReq.Headers.Add("X-Api-Key", apiKey.ApiKey);
        syncReq.Content = JsonContent.Create(new SyncRequest
        {
            CharacterName = charName,
            Server = "Asura",
            ActiveJob = "WAR",
            ActiveJobLevel = 75,
            Jobs = [new SyncJobEntry { Job = "WAR", Level = 75 }]
        });
        await _client.SendAsync(syncReq);

        var character = await db.Characters.FirstAsync(c => c.Name == charName);
        return (auth.AccessToken, apiKey.ApiKey, character.Id);
    }

    [Fact]
    public async Task Summary_reports_unresolved_and_not_owned_counts_for_owner()
    {
        var (token, _, characterId) = await SetupUserWithCharacterAsync("health@test.com", "health", "Healthchar");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var now = DateTimeOffset.UtcNow;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            db.GameItems.Add(new GameItem { ItemId = 100, Name = "Owned Item", Slots = 0x1, Category = "Armor" });
            db.GameItems.Add(new GameItem { ItemId = 200, Name = "Unowned Item", Slots = 0x1, Category = "Armor" });
            // Owner owns item 100 (inventory). default(InventoryBag) is a valid enum value.
            db.CharacterInventories.Add(new CharacterInventory
            {
                CharacterId = characterId, ItemId = 100, Bag = default, SlotIndex = 0, Quantity = 1, LastSeenAt = now
            });
            var set = new CharacterGearSet
            {
                CharacterId = characterId, Name = "Mixed", Job = "THF", Category = "Engaged",
                TagsJson = "[]", CreatedAt = now, UpdatedAt = now
            };
            set.Slots.Add(new GearSetSlot { Slot = "Head", ItemId = 100, ItemName = "Owned Item" });
            set.Slots.Add(new GearSetSlot { Slot = "Body", ItemId = 200, ItemName = "Unowned Item" });
            set.Slots.Add(new GearSetSlot { Slot = "Hands", ItemId = 0, ItemName = "Mystery Gloves" });
            db.CharacterGearSets.Add(set);
            await db.SaveChangesAsync();
        }

        var list = await _client.GetFromJsonAsync<List<GearSetSummaryResponse>>(
            $"/api/characters/{characterId}/gear-sets");
        var summary = Assert.Single(list!);
        Assert.Equal(1, summary.UnresolvedCount);   // the ItemId 0 slot
        Assert.Equal(1, summary.NotOwnedCount);      // item 200 unowned; 100 owned; unresolved excluded
    }

    [Fact]
    public async Task LoadGearSets_without_owned_ids_leaves_not_owned_null()
    {
        var (_, _, characterId) = await SetupUserWithCharacterAsync("health2@test.com", "health2", "Healthtwo");
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var now = DateTimeOffset.UtcNow;
        var set = new CharacterGearSet
        {
            CharacterId = characterId, Name = "S", Category = "Other",
            TagsJson = "[]", CreatedAt = now, UpdatedAt = now
        };
        set.Slots.Add(new GearSetSlot { Slot = "Head", ItemId = 0, ItemName = "Mystery" });
        db.CharacterGearSets.Add(set);
        await db.SaveChangesAsync();

        var result = await Vanalytics.Api.Controllers.CharactersController.LoadGearSetsAsync(db, characterId);
        var summary = Assert.Single(result);
        Assert.Equal(1, summary.UnresolvedCount);
        Assert.Null(summary.NotOwnedCount);
    }
}
