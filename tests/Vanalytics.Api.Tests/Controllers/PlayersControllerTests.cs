using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Vanalytics.Api.DTOs;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class PlayersControllerTests : IAsyncLifetime
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
    /// GetPlayers includes TotalScore from CharacterAchievements (left-join):
    ///   - Characters with an achievement row return their score.
    ///   - Characters without an achievement row return 0.
    ///   - Private characters are excluded entirely.
    /// </summary>
    [Fact]
    public async Task GetPlayers_IncludesTotalScore_ZeroWhenNoAchievementRow()
    {
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

            var user = Achievements.TestData.AddUser(db);

            // Public character WITH an achievement row.
            var charWithScore = Achievements.TestData.AddCharacter(db, user.Id, "ScoreChar", "Asura", isPublic: true);
            db.CharacterAchievements.Add(new CharacterAchievement
            {
                CharacterId = charWithScore.Id,
                TotalScore = 1500,
                BreakdownJson = "[]",
                RubricVersion = 1,
                ComputedAt = DateTimeOffset.UtcNow,
            });

            // Public character WITHOUT an achievement row.
            Achievements.TestData.AddCharacter(db, user.Id, "NoScoreChar", "Asura", isPublic: true);

            // Private character — must not appear in directory.
            var privateChar = Achievements.TestData.AddCharacter(db, user.Id, "PrivChar", "Asura", isPublic: false);
            db.CharacterAchievements.Add(new CharacterAchievement
            {
                CharacterId = privateChar.Id,
                TotalScore = 9999,
                BreakdownJson = "[]",
                RubricVersion = 1,
                ComputedAt = DateTimeOffset.UtcNow,
            });

            await db.SaveChangesAsync();
        }

        var list = await _client.GetFromJsonAsync<List<PlayerListItem>>("/api/players?server=Asura");

        Assert.NotNull(list);
        // Private character must not appear.
        Assert.DoesNotContain(list!, p => p.Name == "PrivChar");

        var withScore = Assert.Single(list!, p => p.Name == "ScoreChar");
        Assert.Equal(1500, withScore.TotalScore);

        var noScore = Assert.Single(list!, p => p.Name == "NoScoreChar");
        Assert.Equal(0, noScore.TotalScore);
    }
}
