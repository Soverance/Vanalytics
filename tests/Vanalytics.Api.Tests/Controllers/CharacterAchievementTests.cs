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
using Vanalytics.Core.DTOs.Achievements;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class CharacterAchievementTests : IAsyncLifetime
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

    private async Task<Guid> SyncCharacterAsync(string apiKey, string charName, string server = "Asura")
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/sync");
        req.Headers.Add("X-Api-Key", apiKey);
        req.Content = JsonContent.Create(new SyncRequest
        {
            CharacterName = charName,
            Server = server,
            ActiveJob = "WAR",
            ActiveJobLevel = 75
        });
        await _client.SendAsync(req);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        return (await db.Characters.FirstAsync(c => c.Name == charName && c.Server == server)).Id;
    }

    private async Task MakePublicAsync(string jwt, Guid characterId)
    {
        var req = new HttpRequestMessage(HttpMethod.Put, $"/api/characters/{characterId}");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", jwt);
        req.Content = JsonContent.Create(new { IsPublic = true });
        await _client.SendAsync(req);
    }

    private async Task AddAchievementAsync(Guid characterId, int totalScore)
    {
        // Sync already upserts a CharacterAchievement row (score≈0 for bare character).
        // We overwrite it so our controlled score is what the endpoint reads.
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var existing = await db.CharacterAchievements.FindAsync(characterId);
        if (existing is not null)
        {
            existing.TotalScore = totalScore;
            existing.BreakdownJson = "[]";
            existing.RubricVersion = 1;
            existing.ComputedAt = DateTimeOffset.UtcNow;
        }
        else
        {
            db.CharacterAchievements.Add(new CharacterAchievement
            {
                CharacterId = characterId,
                TotalScore = totalScore,
                BreakdownJson = "[]",
                RubricVersion = 1,
                ComputedAt = DateTimeOffset.UtcNow
            });
        }
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// Assertion 1: Public character with score 500, alongside a second public character with score 900.
    /// GET the 500 character's achievement → 200, TotalScore=500, GlobalRank=2 (900 ranks first).
    /// </summary>
    [Fact]
    public async Task GetAchievement_PublicCharacter_ReturnsScoreAndRank()
    {
        // Arrange: two users, each with one public character having a CharacterAchievement row.
        var (jwt1, key1) = await SetupSyncUserAsync("ach1a@test.com", "ach1auser");
        var (_, key2) = await SetupSyncUserAsync("ach1b@test.com", "ach1buser");

        var charId500 = await SyncCharacterAsync(key1, "AchChar500", "Asura");
        var charId900 = await SyncCharacterAsync(key2, "AchChar900", "Asura");

        await MakePublicAsync(jwt1, charId500);
        // Make char900 public by logging in as user2
        var login2 = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest { Email = "ach1b@test.com", Password = "Password123!" });
        var auth2 = (await login2.Content.ReadFromJsonAsync<AuthResponse>())!;
        await MakePublicAsync(auth2.AccessToken, charId900);

        await AddAchievementAsync(charId500, 500);
        await AddAchievementAsync(charId900, 900);

        // Act
        var req = new HttpRequestMessage(HttpMethod.Get, $"/api/characters/{charId500}/achievement");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", jwt1);
        var resp = await _client.SendAsync(req);

        // Assert
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = (await resp.Content.ReadFromJsonAsync<CharacterAchievementResponse>())!;
        Assert.Equal(500, body.TotalScore);
        Assert.Equal(2, body.GlobalRank); // 900 ranks above 500 → rank 2
        Assert.NotNull(body.ServerRank);  // both on Asura, 900 is ahead → rank 2
        Assert.Equal(2, body.ServerRank);
    }

    /// <summary>
    /// Assertion 2: Owner reads own PRIVATE character → 200 with null GlobalRank/ServerRank.
    /// </summary>
    [Fact]
    public async Task GetAchievement_OwnerReadsPrivateCharacter_ReturnsNullRanks()
    {
        // Arrange
        var (jwt, key) = await SetupSyncUserAsync("ach2@test.com", "ach2user");
        var charId = await SyncCharacterAsync(key, "AchPrivChar", "Asura");
        // Do NOT make public; character.IsPublic remains false.
        await AddAchievementAsync(charId, 300);

        // Act
        var req = new HttpRequestMessage(HttpMethod.Get, $"/api/characters/{charId}/achievement");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", jwt);
        var resp = await _client.SendAsync(req);

        // Assert: 200 with null ranks (private = no leaderboard standing)
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = (await resp.Content.ReadFromJsonAsync<CharacterAchievementResponse>())!;
        Assert.Equal(300, body.TotalScore);
        Assert.Null(body.GlobalRank);
        Assert.Null(body.ServerRank);
    }

    /// <summary>
    /// Assertion 3: Non-owner reading a PRIVATE character → 403 Forbidden (matches existing CharactersController gate).
    /// </summary>
    [Fact]
    public async Task GetAchievement_NonOwnerReadsPrivateCharacter_ReturnsForbidden()
    {
        // Arrange: character owner (user A) keeps character private.
        var (_, keyA) = await SetupSyncUserAsync("ach3a@test.com", "ach3auser");
        var charId = await SyncCharacterAsync(keyA, "AchPrivOther", "Asura");
        await AddAchievementAsync(charId, 200);

        // Caller is user B (different user, authenticated).
        var (jwtB, _) = await SetupSyncUserAsync("ach3b@test.com", "ach3buser");

        // Act
        var req = new HttpRequestMessage(HttpMethod.Get, $"/api/characters/{charId}/achievement");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", jwtB);
        var resp = await _client.SendAsync(req);

        // Assert: 403 — the same status CharactersController returns for all non-owner private character reads.
        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }
}
