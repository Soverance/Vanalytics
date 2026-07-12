using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Vanalytics.Core.DTOs.Achievements;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class CharacterLeaderboardTests : IAsyncLifetime
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

    /// <summary>
    /// Seed helper: adds a User + Character + CharacterAchievement in one call.
    /// Does NOT call SaveChangesAsync — caller must do so.
    /// </summary>
    private static CharacterAchievement AddCharacterWithAchievement(
        VanalyticsDbContext db,
        string server,
        string name,
        int totalScore,
        bool isPublic)
    {
        var user = Achievements.TestData.AddUser(db);
        var character = Achievements.TestData.AddCharacter(db, user.Id, name, server, isPublic);
        var achievement = new CharacterAchievement
        {
            CharacterId = character.Id,
            TotalScore = totalScore,
            BreakdownJson = "[]",
            RubricVersion = 1,
            ComputedAt = DateTimeOffset.UtcNow,
        };
        db.CharacterAchievements.Add(achievement);
        return achievement;
    }

    /// <summary>
    /// Assertion 1:
    ///   Three public characters (scores 900/500/300, on two different servers) and
    ///   one private character (score 9999).
    ///   GET /api/leaderboards/characters (global):
    ///     - Items ordered by score descending: 900, 500, 300
    ///     - Rank values: 1, 2, 3
    ///     - Private character (9999) is absent
    ///     - Total == 3
    /// </summary>
    [Fact]
    public async Task GetCharacterLeaderboard_Global_ReturnsPublicCharactersOrderedByScore()
    {
        // Arrange
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            AddCharacterWithAchievement(db, "Asura", "LbChar900", 900, isPublic: true);
            AddCharacterWithAchievement(db, "Bahamut", "LbChar500", 500, isPublic: true);
            AddCharacterWithAchievement(db, "Asura", "LbChar300", 300, isPublic: true);
            AddCharacterWithAchievement(db, "Asura", "LbCharPrivate9999", 9999, isPublic: false);
            await db.SaveChangesAsync();
        }

        // Act
        var resp = await _client.GetAsync("/api/leaderboards/characters");

        // Assert
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var page = (await resp.Content.ReadFromJsonAsync<LeaderboardPage<CharacterLeaderboardEntry>>())!;

        Assert.Equal(3, page.Total);
        Assert.Equal(3, page.Items.Count);

        Assert.Equal(900, page.Items[0].TotalScore);
        Assert.Equal(1, page.Items[0].Rank);
        Assert.Equal("LbChar900", page.Items[0].Name);

        Assert.Equal(500, page.Items[1].TotalScore);
        Assert.Equal(2, page.Items[1].Rank);
        Assert.Equal("LbChar500", page.Items[1].Name);

        Assert.Equal(300, page.Items[2].TotalScore);
        Assert.Equal(3, page.Items[2].Rank);
        Assert.Equal("LbChar300", page.Items[2].Name);

        // Private char should not appear anywhere
        Assert.DoesNotContain(page.Items, i => i.Name == "LbCharPrivate9999");
    }

    /// <summary>
    /// Assertion 2:
    ///   Same seed as Assertion 1.
    ///   GET /api/leaderboards/characters?server=Bahamut:
    ///     - Only "LbChar500" (the Bahamut character) is returned
    ///     - Rank re-bases from 1 within the filtered set
    ///     - Total == 1
    /// </summary>
    [Fact]
    public async Task GetCharacterLeaderboard_FilteredByServer_ReturnsRebasedRanks()
    {
        // Arrange — seed characters on Asura and Bahamut
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            AddCharacterWithAchievement(db, "Asura", "LbChar900b", 900, isPublic: true);
            AddCharacterWithAchievement(db, "Bahamut", "LbChar500b", 500, isPublic: true);
            AddCharacterWithAchievement(db, "Asura", "LbChar300b", 300, isPublic: true);
            AddCharacterWithAchievement(db, "Asura", "LbCharPrivate9999b", 9999, isPublic: false);
            await db.SaveChangesAsync();
        }

        // Act
        var resp = await _client.GetAsync("/api/leaderboards/characters?server=Bahamut");

        // Assert
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var page = (await resp.Content.ReadFromJsonAsync<LeaderboardPage<CharacterLeaderboardEntry>>())!;

        Assert.Equal(1, page.Total);
        Assert.Single(page.Items);
        Assert.Equal("LbChar500b", page.Items[0].Name);
        Assert.Equal(500, page.Items[0].TotalScore);
        Assert.Equal(1, page.Items[0].Rank); // re-based: rank 1 in Bahamut scope
        Assert.Equal("Bahamut", page.Items[0].Server);
    }
}
