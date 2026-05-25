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
using Vanalytics.Core.DTOs.Porter;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class PorterControllerTests : IAsyncLifetime
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

    private async Task SeedGameItemsAsync(params (int ItemId, string Name)[] items)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var now = DateTimeOffset.UtcNow;
        foreach (var (itemId, name) in items)
        {
            if (!await db.GameItems.AnyAsync(g => g.ItemId == itemId))
            {
                db.GameItems.Add(new GameItem
                {
                    ItemId = itemId,
                    Name = name,
                    Category = "TestCategory",
                    StackSize = 1,
                    CreatedAt = now,
                    UpdatedAt = now
                });
            }
        }
        await db.SaveChangesAsync();
    }

    private HttpRequestMessage PorterSyncRequest(string apiKey, PorterSyncRequest payload)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/sync/porter");
        req.Headers.Add("X-Api-Key", apiKey);
        req.Content = JsonContent.Create(payload);
        return req;
    }

    private HttpRequestMessage Authed(HttpMethod method, string url, string token)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return req;
    }

    [Fact]
    public async Task SyncPorter_NewSlip_InsertsRows()
    {
        var (_, apiKey, charId) = await SetupUserWithCharacterAsync("porter1@test.com", "porter1user", "PorterChar1");

        var payload = new PorterSyncRequest
        {
            CharacterName = "PorterChar1",
            Server = "Asura",
            Slips = [
                new PorterSlipEntry { SlipItemId = 28005, SlipNumber = 1, ItemIds = [16385, 16386, 16387] }
            ]
        };

        var resp = await _client.SendAsync(PorterSyncRequest(apiKey, payload));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var slip = await db.CharacterPorterSlips.FirstAsync(s => s.CharacterId == charId);
        Assert.Equal(28005, slip.SlipItemId);
        Assert.Equal(1, slip.SlipNumber);
        Assert.False(slip.UserHidden);

        var items = await db.CharacterPorterItems.Where(p => p.CharacterId == charId).ToListAsync();
        Assert.Equal(3, items.Count);
        Assert.Contains(items, i => i.ItemId == 16385);
        Assert.Contains(items, i => i.ItemId == 16386);
        Assert.Contains(items, i => i.ItemId == 16387);
    }

    [Fact]
    public async Task SyncPorter_ReplacesSlipContents()
    {
        var (_, apiKey, charId) = await SetupUserWithCharacterAsync("porter2@test.com", "porter2user", "PorterChar2");

        // First sync
        await _client.SendAsync(PorterSyncRequest(apiKey, new PorterSyncRequest
        {
            CharacterName = "PorterChar2",
            Server = "Asura",
            Slips = [new PorterSlipEntry { SlipItemId = 28005, SlipNumber = 1, ItemIds = [100, 200, 300] }]
        }));

        // Second sync changes contents — old items must be gone, new ones in
        var resp = await _client.SendAsync(PorterSyncRequest(apiKey, new PorterSyncRequest
        {
            CharacterName = "PorterChar2",
            Server = "Asura",
            Slips = [new PorterSlipEntry { SlipItemId = 28005, SlipNumber = 1, ItemIds = [200, 400] }]
        }));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var itemIds = await db.CharacterPorterItems
            .Where(p => p.CharacterId == charId && p.SlipItemId == 28005)
            .Select(p => p.ItemId)
            .ToListAsync();

        Assert.Equal(2, itemIds.Count);
        Assert.Contains(200, itemIds);
        Assert.Contains(400, itemIds);
        Assert.DoesNotContain(100, itemIds);
        Assert.DoesNotContain(300, itemIds);
    }

    [Fact]
    public async Task SyncPorter_OmittedSlip_LeftUntouched()
    {
        var (_, apiKey, charId) = await SetupUserWithCharacterAsync("porter3@test.com", "porter3user", "PorterChar3");

        // Seed two slips
        await _client.SendAsync(PorterSyncRequest(apiKey, new PorterSyncRequest
        {
            CharacterName = "PorterChar3",
            Server = "Asura",
            Slips = [
                new PorterSlipEntry { SlipItemId = 28005, SlipNumber = 1, ItemIds = [10, 20] },
                new PorterSlipEntry { SlipItemId = 28006, SlipNumber = 2, ItemIds = [30, 40] }
            ]
        }));

        // Re-sync with only slip 1 — slip 2 must survive untouched
        var resp = await _client.SendAsync(PorterSyncRequest(apiKey, new PorterSyncRequest
        {
            CharacterName = "PorterChar3",
            Server = "Asura",
            Slips = [new PorterSlipEntry { SlipItemId = 28005, SlipNumber = 1, ItemIds = [10, 20, 50] }]
        }));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var slip2Items = await db.CharacterPorterItems
            .Where(p => p.CharacterId == charId && p.SlipItemId == 28006)
            .Select(p => p.ItemId)
            .ToListAsync();
        Assert.Equal(2, slip2Items.Count);
        Assert.Contains(30, slip2Items);
        Assert.Contains(40, slip2Items);

        var slip1Items = await db.CharacterPorterItems
            .Where(p => p.CharacterId == charId && p.SlipItemId == 28005)
            .Select(p => p.ItemId)
            .ToListAsync();
        Assert.Equal(3, slip1Items.Count);
        Assert.Contains(50, slip1Items);
    }

    [Fact]
    public async Task SyncPorter_DedupesItemIdsWithinSlip()
    {
        var (_, apiKey, charId) = await SetupUserWithCharacterAsync("porter4@test.com", "porter4user", "PorterChar4");

        var resp = await _client.SendAsync(PorterSyncRequest(apiKey, new PorterSyncRequest
        {
            CharacterName = "PorterChar4",
            Server = "Asura",
            Slips = [new PorterSlipEntry { SlipItemId = 28005, SlipNumber = 1, ItemIds = [100, 100, 200, 100] }]
        }));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var items = await db.CharacterPorterItems
            .Where(p => p.CharacterId == charId)
            .ToListAsync();

        Assert.Equal(2, items.Count);
        Assert.Equal(1, items.Count(i => i.ItemId == 100));
        Assert.Equal(1, items.Count(i => i.ItemId == 200));
    }

    [Fact]
    public async Task SyncPorter_CharacterNotOwned_ReturnsForbidden()
    {
        var (_, _, _) = await SetupUserWithCharacterAsync("porter5a@test.com", "porter5auser", "OwnedChar");
        var (_, otherApiKey, _) = await SetupUserWithCharacterAsync("porter5b@test.com", "porter5buser", "OtherChar");

        var resp = await _client.SendAsync(PorterSyncRequest(otherApiKey, new PorterSyncRequest
        {
            CharacterName = "OwnedChar",
            Server = "Asura",
            Slips = [new PorterSlipEntry { SlipItemId = 28005, SlipNumber = 1, ItemIds = [100] }]
        }));

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    [Fact]
    public async Task SyncPorter_UnknownCharacter_ReturnsNotFound()
    {
        var (_, apiKey, _) = await SetupUserWithCharacterAsync("porter6@test.com", "porter6user", "ExistingChar");

        var resp = await _client.SendAsync(PorterSyncRequest(apiKey, new PorterSyncRequest
        {
            CharacterName = "NoSuchCharacter",
            Server = "Asura",
            Slips = [new PorterSlipEntry { SlipItemId = 28005, SlipNumber = 1, ItemIds = [100] }]
        }));

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task SyncPorter_WithoutApiKey_ReturnsUnauthorized()
    {
        var resp = await _client.PostAsJsonAsync("/api/sync/porter", new PorterSyncRequest
        {
            CharacterName = "AnyChar",
            Server = "Asura",
            Slips = []
        });

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task GetPorter_ReturnsSlipsWithItemNames()
    {
        var (token, apiKey, charId) = await SetupUserWithCharacterAsync("porter7@test.com", "porter7user", "PorterChar7");
        await SeedGameItemsAsync(
            (28005, "Storage Slip 01"),
            (28006, "Storage Slip 02"),
            (100, "Acid Bolt"),
            (200, "Antlion Arrow"),
            (300, "Beetle Arrow"));

        await _client.SendAsync(PorterSyncRequest(apiKey, new PorterSyncRequest
        {
            CharacterName = "PorterChar7",
            Server = "Asura",
            Slips = [
                new PorterSlipEntry { SlipItemId = 28005, SlipNumber = 1, ItemIds = [100, 200] },
                new PorterSlipEntry { SlipItemId = 28006, SlipNumber = 2, ItemIds = [300] }
            ]
        }));

        var resp = await _client.SendAsync(Authed(HttpMethod.Get, $"/api/characters/{charId}/porter", token));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var slips = await resp.Content.ReadFromJsonAsync<List<PorterSlipResponse>>();
        Assert.NotNull(slips);
        Assert.Equal(2, slips!.Count);

        var slip1 = slips.First(s => s.SlipItemId == 28005);
        Assert.Equal("Storage Slip 01", slip1.SlipName);
        Assert.Equal(2, slip1.Items.Count);
        Assert.Contains(slip1.Items, i => i.ItemName == "Acid Bolt");
        Assert.Contains(slip1.Items, i => i.ItemName == "Antlion Arrow");

        var slip2 = slips.First(s => s.SlipItemId == 28006);
        Assert.Equal("Storage Slip 02", slip2.SlipName);
        Assert.Single(slip2.Items);
    }

    [Fact]
    public async Task GetPorter_NonOwner_Forbidden()
    {
        var (_, _, charId) = await SetupUserWithCharacterAsync("porter8a@test.com", "porter8auser", "PorterChar8");
        var (otherToken, _, _) = await SetupUserWithCharacterAsync("porter8b@test.com", "porter8buser", "OtherChar8");

        var resp = await _client.SendAsync(Authed(HttpMethod.Get, $"/api/characters/{charId}/porter", otherToken));
        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    [Fact]
    public async Task PatchPorterSlip_TogglesUserHidden()
    {
        var (token, apiKey, charId) = await SetupUserWithCharacterAsync("porter9@test.com", "porter9user", "PorterChar9");

        await _client.SendAsync(PorterSyncRequest(apiKey, new PorterSyncRequest
        {
            CharacterName = "PorterChar9",
            Server = "Asura",
            Slips = [new PorterSlipEntry { SlipItemId = 28005, SlipNumber = 1, ItemIds = [100] }]
        }));

        var req = Authed(HttpMethod.Patch, $"/api/characters/{charId}/porter/28005", token);
        req.Content = JsonContent.Create(new UpdatePorterSlipRequest { UserHidden = true });
        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.NoContent, resp.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var slip = await db.CharacterPorterSlips.FirstAsync(s => s.CharacterId == charId && s.SlipItemId == 28005);
        Assert.True(slip.UserHidden);
    }

    [Fact]
    public async Task DeletePorterSlip_RemovesSlipAndItems()
    {
        var (token, apiKey, charId) = await SetupUserWithCharacterAsync("porter10@test.com", "porter10user", "PorterChar10");

        await _client.SendAsync(PorterSyncRequest(apiKey, new PorterSyncRequest
        {
            CharacterName = "PorterChar10",
            Server = "Asura",
            Slips = [
                new PorterSlipEntry { SlipItemId = 28005, SlipNumber = 1, ItemIds = [100, 200] },
                new PorterSlipEntry { SlipItemId = 28006, SlipNumber = 2, ItemIds = [300] }
            ]
        }));

        var resp = await _client.SendAsync(Authed(HttpMethod.Delete, $"/api/characters/{charId}/porter/28005", token));
        Assert.Equal(HttpStatusCode.NoContent, resp.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        Assert.Empty(await db.CharacterPorterSlips
            .Where(s => s.CharacterId == charId && s.SlipItemId == 28005)
            .ToListAsync());
        Assert.Empty(await db.CharacterPorterItems
            .Where(p => p.CharacterId == charId && p.SlipItemId == 28005)
            .ToListAsync());

        // Slip 2 untouched
        Assert.Single(await db.CharacterPorterSlips
            .Where(s => s.CharacterId == charId && s.SlipItemId == 28006)
            .ToListAsync());
    }

    [Fact]
    public async Task DeletePorterSlip_NonOwner_Forbidden()
    {
        var (_, apiKey, charId) = await SetupUserWithCharacterAsync("porter11a@test.com", "porter11auser", "PorterChar11");
        var (otherToken, _, _) = await SetupUserWithCharacterAsync("porter11b@test.com", "porter11buser", "OtherChar11");

        await _client.SendAsync(PorterSyncRequest(apiKey, new PorterSyncRequest
        {
            CharacterName = "PorterChar11",
            Server = "Asura",
            Slips = [new PorterSlipEntry { SlipItemId = 28005, SlipNumber = 1, ItemIds = [100] }]
        }));

        var resp = await _client.SendAsync(Authed(HttpMethod.Delete, $"/api/characters/{charId}/porter/28005", otherToken));
        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }
}
