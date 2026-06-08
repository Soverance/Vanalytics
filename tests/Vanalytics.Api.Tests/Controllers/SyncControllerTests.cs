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
using Vanalytics.Core.DTOs.Characters;
using Vanalytics.Core.DTOs.Keys;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Core.Enums;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class SyncControllerTests : IAsyncLifetime
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
        // Create user directly in DB and login
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

        // Generate API key
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

    [Fact]
    public async Task Sync_WithValidApiKey_UpsertsData()
    {
        var (_, apiKey) = await SetupSyncUserAsync("sync1@test.com", "sync1user");

        var payload = new SyncRequest
        {
            CharacterName = "SyncChar1",
            Server = "Asura",
            ActiveJob = "THF",
            ActiveJobLevel = 99,
            Jobs = [new SyncJobEntry { Job = "THF", Level = 99 }, new SyncJobEntry { Job = "DNC", Level = 49 }],
            Gear = [new SyncGearEntry { Slot = "Main", ItemName = "Vajra", ItemId = 20515 }],
            Crafting = [new SyncCraftingEntry { Craft = "Goldsmithing", Level = 110, Rank = "Craftsman" }]
        };

        var resp = await _client.SendAsync(CreateSyncRequest(apiKey, payload));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var character = await db.Characters
            .Include(c => c.Jobs)
            .Include(c => c.Gear)
            .Include(c => c.CraftingSkills)
            .FirstAsync(c => c.Name == "SyncChar1");

        Assert.Equal(2, character.Jobs.Count);
        Assert.Single(character.Gear);
        Assert.Equal("Vajra", character.Gear[0].ItemName);
        Assert.Single(character.CraftingSkills);
        Assert.NotNull(character.LastSyncAt);
    }

    [Fact]
    public async Task Sync_CharacterNotOwnedByUser_ReturnsForbidden()
    {
        // User A creates character via sync
        var (_, apiKeyA) = await SetupSyncUserAsync("sync3a@test.com", "sync3auser");
        var setupPayload = new SyncRequest
        {
            CharacterName = "SyncChar3",
            Server = "Asura",
            ActiveJob = "WAR",
            ActiveJobLevel = 75
        };
        await _client.SendAsync(CreateSyncRequest(apiKeyA, setupPayload));

        // User B tries to sync same character
        var (_, apiKeyB) = await SetupSyncUserAsync("sync3b@test.com", "sync3buser");
        var payload = new SyncRequest
        {
            CharacterName = "SyncChar3",
            Server = "Asura",
            ActiveJob = "WAR",
            ActiveJobLevel = 75
        };

        var resp = await _client.SendAsync(CreateSyncRequest(apiKeyB, payload));
        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    [Fact]
    public async Task Sync_WithoutApiKey_ReturnsUnauthorized()
    {
        var payload = new SyncRequest
        {
            CharacterName = "NoAuth",
            Server = "Asura",
            ActiveJob = "WAR",
            ActiveJobLevel = 75
        };

        var resp = await _client.PostAsJsonAsync("/api/sync", payload);

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Sync_RateLimitExceeded_Returns429()
    {
        var (_, apiKey) = await SetupSyncUserAsync("sync4@test.com", "sync4user");

        var payload = new SyncRequest
        {
            CharacterName = "SyncChar4",
            Server = "Asura",
            ActiveJob = "WAR",
            ActiveJobLevel = 75,
            Jobs = [new SyncJobEntry { Job = "WAR", Level = 75 }]
        };

        // Send 20 requests (should all succeed)
        for (int i = 0; i < 20; i++)
        {
            var resp = await _client.SendAsync(CreateSyncRequest(apiKey, payload));
            Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        }

        // 21st request should be rate limited
        var limitedResp = await _client.SendAsync(CreateSyncRequest(apiKey, payload));
        Assert.Equal((HttpStatusCode)429, limitedResp.StatusCode);
    }

    [Fact]
    public async Task Sync_GearWithAugments_PersistsAugmentsJson()
    {
        var (_, apiKey) = await SetupSyncUserAsync("syncaug@test.com", "syncauguser");

        var payload = new SyncRequest
        {
            CharacterName = "AugChar",
            Server = "Asura",
            ActiveJob = "THF",
            ActiveJobLevel = 99,
            Gear =
            [
                new SyncGearEntry
                {
                    Slot = "Back", ItemName = "Toutatis's Cape", ItemId = 26252,
                    Augments = ["DEX+9", "DEX+2", "Weapon skill damage +8%"]
                },
                new SyncGearEntry { Slot = "Main", ItemName = "Mandau", ItemId = 21003 }
            ]
        };

        var resp = await _client.SendAsync(CreateSyncRequest(apiKey, payload));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var gear = await db.EquippedGear
            .Where(g => g.Character.Name == "AugChar")
            .ToListAsync();

        var cape = gear.Single(g => g.ItemName == "Toutatis's Cape");
        var capeAugments = JsonSerializer.Deserialize<List<string>>(cape.AugmentsJson!);
        Assert.Equal(new[] { "DEX+9", "DEX+2", "Weapon skill damage +8%" }, capeAugments);
        var main = gear.Single(g => g.ItemName == "Mandau");
        Assert.Null(main.AugmentsJson);
    }

    [Fact]
    public async Task CharacterDetail_ExposesGearAugments()
    {
        var (jwt, apiKey) = await SetupSyncUserAsync("syncaug2@test.com", "syncaug2user");

        var syncResp = await _client.SendAsync(CreateSyncRequest(apiKey, new SyncRequest
        {
            CharacterName = "AugChar2",
            Server = "Asura",
            ActiveJob = "THF",
            ActiveJobLevel = 99,
            Gear = [new SyncGearEntry
            {
                Slot = "Back", ItemName = "Toutatis's Cape", ItemId = 26252,
                Augments = ["DEX+20", "Accuracy+20 Attack+20", "Weapon skill damage +10%"]
            }]
        }));
        Assert.Equal(HttpStatusCode.OK, syncResp.StatusCode);

        Guid charId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            charId = (await db.Characters.FirstAsync(c => c.Name == "AugChar2")).Id;
        }

        var req = new HttpRequestMessage(HttpMethod.Get, $"/api/characters/{charId}");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", jwt);
        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var detail = (await resp.Content.ReadFromJsonAsync<CharacterDetailResponse>())!;
        var cape = detail.Gear.Single(g => g.ItemName == "Toutatis's Cape");
        Assert.Equal(new[] { "DEX+20", "Accuracy+20 Attack+20", "Weapon skill damage +10%" }, cape.Augments);
    }

    [Fact]
    public async Task Sync_WithLinkshells_CreatesLinkshellsAndMemberships()
    {
        var (_, apiKey) = await SetupSyncUserAsync("ls1@test.com", "ls1user");
        var payload = new SyncRequest
        {
            CharacterName = "LsChar1",
            Server = "Asura",
            ActiveJob = "WAR",
            ActiveJobLevel = 99,
            Linkshells =
            [
                new SyncLinkshellEntry { Slot = 1, LinkshellId = 1001, Name = "Alpha", ColorRgb = 0xFF0000, Rank = "leader" },
                new SyncLinkshellEntry { Slot = 2, LinkshellId = 1002, Name = "Beta", ColorRgb = 0x00FF00, Rank = "member" },
            ]
        };

        var resp = await _client.SendAsync(CreateSyncRequest(apiKey, payload));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var character = await db.Characters.FirstAsync(c => c.Name == "LsChar1");
        var memberships = await db.LinkshellMemberships
            .Include(m => m.Linkshell)
            .Where(m => m.CharacterId == character.Id)
            .ToListAsync();

        Assert.Equal(2, memberships.Count);
        Assert.All(memberships, m => Assert.True(m.IsCurrent));
        var leader = memberships.Single(m => m.Linkshell.Name == "Alpha");
        Assert.Equal(LinkshellRank.Leader, leader.Rank);
        Assert.Equal(1, leader.Slot);
        Assert.Equal(0xFF0000, leader.Linkshell.ColorRgb);
    }

    [Fact]
    public async Task Sync_LinkshellRemoved_MarksMembershipNotCurrentNotDeleted()
    {
        var (_, apiKey) = await SetupSyncUserAsync("ls2@test.com", "ls2user");
        SyncRequest Make(params SyncLinkshellEntry[] ls) => new()
        {
            CharacterName = "LsChar2",
            Server = "Asura",
            ActiveJob = "WAR",
            ActiveJobLevel = 99,
            Linkshells = ls.ToList()
        };
        var a = new SyncLinkshellEntry { Slot = 1, LinkshellId = 2001, Name = "Aaa", ColorRgb = 1, Rank = "member" };
        var b = new SyncLinkshellEntry { Slot = 2, LinkshellId = 2002, Name = "Bbb", ColorRgb = 2, Rank = "member" };
        await _client.SendAsync(CreateSyncRequest(apiKey, Make(a, b)));

        var c = new SyncLinkshellEntry { Slot = 2, LinkshellId = 2003, Name = "Ccc", ColorRgb = 3, Rank = "member" };
        await _client.SendAsync(CreateSyncRequest(apiKey, Make(a, c)));

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var character = await db.Characters.FirstAsync(ch => ch.Name == "LsChar2");
        var all = await db.LinkshellMemberships
            .Include(m => m.Linkshell)
            .Where(m => m.CharacterId == character.Id)
            .ToListAsync();

        Assert.Equal(3, all.Count);
        Assert.True(all.Single(m => m.Linkshell.Name == "Aaa").IsCurrent);
        Assert.False(all.Single(m => m.Linkshell.Name == "Bbb").IsCurrent);
        Assert.True(all.Single(m => m.Linkshell.Name == "Ccc").IsCurrent);
    }

    [Fact]
    public async Task Sync_LinkshellRenamed_RefreshesNameOnSameGameId()
    {
        var (_, apiKey) = await SetupSyncUserAsync("ls3@test.com", "ls3user");
        SyncRequest Make(string name) => new()
        {
            CharacterName = "LsChar3",
            Server = "Asura",
            ActiveJob = "WAR",
            ActiveJobLevel = 99,
            Linkshells = [new SyncLinkshellEntry { Slot = 1, LinkshellId = 3001, Name = name, ColorRgb = 5, Rank = "leader" }]
        };
        await _client.SendAsync(CreateSyncRequest(apiKey, Make("OldName")));
        await _client.SendAsync(CreateSyncRequest(apiKey, Make("NewName")));

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var rows = await db.Linkshells
            .Where(l => l.Server == "Asura" && l.GameLinkshellId == 3001)
            .ToListAsync();

        Assert.Single(rows);
        Assert.Equal("NewName", rows[0].Name);
    }

    [Fact]
    public async Task Sync_SecondSync_UpsertsExistingData()
    {
        var (_, apiKey) = await SetupSyncUserAsync("sync5@test.com", "sync5user");

        // First sync
        var payload1 = new SyncRequest
        {
            CharacterName = "SyncChar5",
            Server = "Asura",
            ActiveJob = "THF",
            ActiveJobLevel = 75,
            Jobs = [new SyncJobEntry { Job = "THF", Level = 75 }]
        };
        await _client.SendAsync(CreateSyncRequest(apiKey, payload1));

        // Second sync with updated data
        var payload2 = new SyncRequest
        {
            CharacterName = "SyncChar5",
            Server = "Asura",
            ActiveJob = "THF",
            ActiveJobLevel = 99,
            Jobs = [
                new SyncJobEntry { Job = "THF", Level = 99 },
                new SyncJobEntry { Job = "DNC", Level = 49 }
            ]
        };
        var resp = await _client.SendAsync(CreateSyncRequest(apiKey, payload2));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var character = await db.Characters
            .Include(c => c.Jobs)
            .FirstAsync(c => c.Name == "SyncChar5");

        Assert.Equal(2, character.Jobs.Count);
        Assert.Equal(99, character.Jobs.First(j => j.JobId == JobType.THF).Level);
    }
}
