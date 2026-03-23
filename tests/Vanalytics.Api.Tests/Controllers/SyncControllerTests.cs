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
        // Register user
        var regResp = await _client.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        { Email = email, Username = username, Password = "Password123!" });
        var auth = (await regResp.Content.ReadFromJsonAsync<AuthResponse>())!;

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
