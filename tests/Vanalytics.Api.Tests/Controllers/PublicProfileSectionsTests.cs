using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
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
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class PublicProfileSectionsTests : IAsyncLifetime
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

    private async Task<string> CreateUserAndGetTokenAsync(string email, string username, string password = "Password123!")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var user = new Soverance.Auth.Models.User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Username = username,
            PasswordHash = Soverance.Auth.Services.PasswordHasher.HashPassword(password),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var response = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest
        {
            Email = email,
            Password = password
        });
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>();
        return auth!.AccessToken;
    }

    /// <summary>
    /// Creates a user directly in the DB, syncs a character (auto-creating it), then makes it public.
    /// Returns the JWT token and the created character summary.
    /// </summary>
    private async Task<(string Token, CharacterSummaryResponse Character)> CreatePublicCharacterAsync(
        string email, string username, string charName, string server)
    {
        // Create user directly in DB and login
        var accessToken = await CreateUserAndGetTokenAsync(email, username);

        // Generate API key
        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        var keyResp = await _client.SendAsync(keyReq);
        var apiKey = (await keyResp.Content.ReadFromJsonAsync<ApiKeyResponse>())!;

        // Sync to auto-create character
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

        // Get character
        var listReq = new HttpRequestMessage(HttpMethod.Get, "/api/characters");
        listReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        var listResp = await _client.SendAsync(listReq);
        var chars = (await listResp.Content.ReadFromJsonAsync<List<CharacterSummaryResponse>>())!;
        var character = chars.First(c => c.Name == charName);

        // Make it public
        var updateReq = new HttpRequestMessage(HttpMethod.Put, $"/api/characters/{character.Id}");
        updateReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        updateReq.Content = JsonContent.Create(new UpdateCharacterRequest { IsPublic = true });
        await _client.SendAsync(updateReq);

        return (accessToken, character);
    }

    /// <summary>
    /// Creates a user, generates an API key, and syncs a character — without making it public.
    /// Used by the _WhenPrivate_ReturnsNotFound tests to assert that private characters are hidden.
    /// </summary>
    private async Task CreatePrivateCharacterAsync(string email, string username, string charName, string server)
    {
        var token = await CreateUserAndGetTokenAsync(email, username);

        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var apiKey = (await (await _client.SendAsync(keyReq)).Content.ReadFromJsonAsync<ApiKeyResponse>())!;

        var syncReq = new HttpRequestMessage(HttpMethod.Post, "/api/sync");
        syncReq.Headers.Add("X-Api-Key", apiKey.ApiKey);
        syncReq.Content = JsonContent.Create(new SyncRequest
        {
            CharacterName = charName,
            Server = server,
            ActiveJob = "WAR",
            ActiveJobLevel = 75
        });
        await _client.SendAsync(syncReq);
    }

    // ── Task 1: Progression ──────────────────────────────────────────────────────

    [Fact]
    public async Task GetProgression_WhenPublic_ReturnsOk()
    {
        await CreatePublicCharacterAsync("pp_prog@test.com", "ppproguser", "ProgChar", "Asura");
        var resp = await _client.GetAsync("/api/profiles/Asura/ProgChar/progression");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    [Fact]
    public async Task GetProgression_WhenPrivate_ReturnsNotFound()
    {
        await CreatePrivateCharacterAsync("pp_progpriv@test.com", "ppprogpriv", "ProgPriv", "Asura");
        var resp = await _client.GetAsync("/api/profiles/Asura/ProgPriv/progression");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task GetProgression_NonExistent_ReturnsNotFound()
    {
        var resp = await _client.GetAsync("/api/profiles/Asura/NoSuchChar/progression");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    // ── Task 2: Collection ───────────────────────────────────────────────────────

    [Fact]
    public async Task GetCollection_WhenPublic_ReturnsOk()
    {
        await CreatePublicCharacterAsync("pp_coll@test.com", "ppcolluser", "CollChar", "Asura");
        var resp = await _client.GetAsync("/api/profiles/Asura/CollChar/collection");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    [Fact]
    public async Task GetCollection_WhenPrivate_ReturnsNotFound()
    {
        await CreatePrivateCharacterAsync("pp_collpriv@test.com", "ppcollpriv", "CollPriv", "Asura");
        var resp = await _client.GetAsync("/api/profiles/Asura/CollPriv/collection");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task GetCollection_NonExistent_ReturnsNotFound()
    {
        var resp = await _client.GetAsync("/api/profiles/Asura/NoSuchChar/collection");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    // ── Task 3: Titles ───────────────────────────────────────────────────────────

    [Fact]
    public async Task GetTitles_WhenPublic_ReturnsOk()
    {
        await CreatePublicCharacterAsync("pp_titles@test.com", "pptitlesuser", "TitleChar", "Asura");
        var resp = await _client.GetAsync("/api/profiles/Asura/TitleChar/titles");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    [Fact]
    public async Task GetTitles_WhenPrivate_ReturnsNotFound()
    {
        await CreatePrivateCharacterAsync("pp_titlespriv@test.com", "pptitlespriv", "TitlePriv", "Asura");
        var resp = await _client.GetAsync("/api/profiles/Asura/TitlePriv/titles");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task GetTitles_NonExistent_ReturnsNotFound()
    {
        var resp = await _client.GetAsync("/api/profiles/Asura/NoSuchChar/titles");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    // ── Task 4: Missions ─────────────────────────────────────────────────────────

    [Fact]
    public async Task GetMissions_WhenPublic_ReturnsOk()
    {
        await CreatePublicCharacterAsync("pp_miss@test.com", "ppmissuser", "MissChar", "Asura");
        var resp = await _client.GetAsync("/api/profiles/Asura/MissChar/missions");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    [Fact]
    public async Task GetMissions_WhenPrivate_ReturnsNotFound()
    {
        await CreatePrivateCharacterAsync("pp_misspriv@test.com", "ppmisspriv", "MissPriv", "Asura");
        var resp = await _client.GetAsync("/api/profiles/Asura/MissPriv/missions");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task GetMissions_NonExistent_ReturnsNotFound()
    {
        var resp = await _client.GetAsync("/api/profiles/Asura/NoSuchChar/missions");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    // ── Task 5: Relics ───────────────────────────────────────────────────────────

    [Fact]
    public async Task GetRelics_WhenPublic_ReturnsOk()
    {
        await CreatePublicCharacterAsync("pp_relic@test.com", "pprelicuser", "RelicChar", "Asura");
        var resp = await _client.GetAsync("/api/profiles/Asura/RelicChar/relics");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    [Fact]
    public async Task GetRelics_WhenPrivate_ReturnsNotFound()
    {
        await CreatePrivateCharacterAsync("pp_relicpriv@test.com", "pprelicpriv", "RelicPriv", "Asura");
        var resp = await _client.GetAsync("/api/profiles/Asura/RelicPriv/relics");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task GetRelics_NonExistent_ReturnsNotFound()
    {
        var resp = await _client.GetAsync("/api/profiles/Asura/NoSuchChar/relics");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    // ── Task 6: Gear Sets ────────────────────────────────────────────────────────

    [Fact]
    public async Task GetGearSets_WhenPublic_ReturnsOk()
    {
        await CreatePublicCharacterAsync("pp_gs@test.com", "ppgsuser", "GsChar", "Asura");
        var resp = await _client.GetAsync("/api/profiles/Asura/GsChar/gear-sets");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    [Fact]
    public async Task GetGearSets_WhenPrivate_ReturnsNotFound()
    {
        await CreatePrivateCharacterAsync("pp_gspriv@test.com", "ppgspriv", "GsPriv", "Asura");
        var resp = await _client.GetAsync("/api/profiles/Asura/GsPriv/gear-sets");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task GetGearSets_NonExistent_ReturnsNotFound()
    {
        var resp = await _client.GetAsync("/api/profiles/Asura/NoSuchChar/gear-sets");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task GetGearSet_NonExistentSet_ReturnsNotFound()
    {
        await CreatePublicCharacterAsync("pp_gs2@test.com", "ppgs2user", "GsChar2", "Asura");
        var resp = await _client.GetAsync("/api/profiles/Asura/GsChar2/gear-sets/999999");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    // ── Task 4 (ML): Master Levels ───────────────────────────────────────────────

    [Fact]
    public async Task PublicProgression_IncludesMasterLevels()
    {
        // Arrange: a public character with per-job master levels synced.
        var server = "Asura";
        var name = "MLPublic";
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var user = new Soverance.Auth.Models.User
            {
                Id = Guid.NewGuid(), Email = "mlpub@test.com", Username = "mlpubuser",
                PasswordHash = "x", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
            };
            db.Users.Add(user);
            var character = new Character
            {
                Id = Guid.NewGuid(), UserId = user.Id, Name = name, Server = server,
                IsPublic = true, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
            };
            db.Characters.Add(character);
            db.CharacterJobs.AddRange(
                new CharacterJob { Id = Guid.NewGuid(), CharacterId = character.Id, JobId = JobType.BLU,
                    Level = 99, MasterLevel = 12, MasterEpCurrent = 1840, MasterEpNeeded = 2400, MasterCapped = false },
                new CharacterJob { Id = Guid.NewGuid(), CharacterId = character.Id, JobId = JobType.WAR,
                    Level = 99, MasterLevel = null }); // locked job, excluded
            await db.SaveChangesAsync();
        }

        // Act
        var resp = await _client.GetAsync($"/api/profiles/{server}/{name}/progression");
        resp.EnsureSuccessStatusCode();
        var body = await resp.Content.ReadFromJsonAsync<ProgressionResponse>();

        // Assert: only unlocked job present, with EP.
        Assert.NotNull(body!.MasterLevels);
        Assert.Single(body.MasterLevels!);
        var blu = body.MasterLevels![0];
        Assert.Equal((int)JobType.BLU, blu.JobId);
        Assert.Equal(12, blu.MasterLevel);
        Assert.Equal(1840, blu.EpCurrent);
    }
}
