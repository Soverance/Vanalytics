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

public class LinkshellLeaderboardTests : IAsyncLifetime
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
    /// Seeds LS-A, LS-B, LS-C into the database.
    /// LS-A: total=1000, avg=250, members=4
    /// LS-B: total=600,  avg=300, members=2
    /// LS-C: total=0,    members=0  (must be excluded)
    /// Returns (lsAId, lsBId, lsCId).
    /// </summary>
    private static async Task<(Guid LsAId, Guid LsBId, Guid LsCId)> SeedLinkshellsAsync(
        WebApplicationFactory<Program> factory,
        string server = "Asura")
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var lsA = new Linkshell
        {
            Id = Guid.NewGuid(),
            Server = server,
            GameLinkshellId = 1001L,
            Name = "AlphaShell",
            ColorRgb = 0xFF0000,
            IsPublic = true,
            FirstSeenAt = DateTimeOffset.UtcNow,
            LastSeenAt = DateTimeOffset.UtcNow,
        };
        var lsB = new Linkshell
        {
            Id = Guid.NewGuid(),
            Server = server,
            GameLinkshellId = 1002L,
            Name = "BetaShell",
            ColorRgb = 0x00FF00,
            IsPublic = true,
            FirstSeenAt = DateTimeOffset.UtcNow,
            LastSeenAt = DateTimeOffset.UtcNow,
        };
        var lsC = new Linkshell
        {
            Id = Guid.NewGuid(),
            Server = server,
            GameLinkshellId = 1003L,
            Name = "EmptyShell",
            ColorRgb = 0x0000FF,
            IsPublic = true,
            FirstSeenAt = DateTimeOffset.UtcNow,
            LastSeenAt = DateTimeOffset.UtcNow,
        };

        db.Linkshells.AddRange(lsA, lsB, lsC);
        await db.SaveChangesAsync();

        db.LinkshellAchievements.AddRange(
            new LinkshellAchievement
            {
                LinkshellId = lsA.Id,
                TotalScore = 1000,
                AverageScore = 250.0,
                RankedMemberCount = 4,
                ComputedAt = DateTimeOffset.UtcNow,
            },
            new LinkshellAchievement
            {
                LinkshellId = lsB.Id,
                TotalScore = 600,
                AverageScore = 300.0,
                RankedMemberCount = 2,
                ComputedAt = DateTimeOffset.UtcNow,
            },
            new LinkshellAchievement
            {
                LinkshellId = lsC.Id,
                TotalScore = 0,
                AverageScore = 0.0,
                RankedMemberCount = 0,
                ComputedAt = DateTimeOffset.UtcNow,
            }
        );
        await db.SaveChangesAsync();

        return (lsA.Id, lsB.Id, lsC.Id);
    }

    /// <summary>
    /// sort=total (default): ordered by TotalScore DESC — expects [A(1000), B(600)].
    /// LS-C (RankedMemberCount=0) must be absent.
    /// Rank values must be 1, 2 in order.
    /// </summary>
    [Fact]
    public async Task GetLinkshellLeaderboard_SortTotal_ReturnsDescendingByTotalScoreExcludingEmpty()
    {
        var (lsAId, lsBId, _) = await SeedLinkshellsAsync(_factory, "Asura");

        var resp = await _client.GetAsync("/api/leaderboards/linkshells?server=Asura&sort=total");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var page = (await resp.Content.ReadFromJsonAsync<LeaderboardPage<LinkshellLeaderboardEntry>>())!;

        Assert.Equal(2, page.Total);
        Assert.Equal(2, page.Items.Count);

        // First: LS-A (total=1000)
        Assert.Equal(lsAId, page.Items[0].LinkshellId);
        Assert.Equal("AlphaShell", page.Items[0].Name);
        Assert.Equal(1000, page.Items[0].TotalScore);
        Assert.Equal(1, page.Items[0].Rank);

        // Second: LS-B (total=600)
        Assert.Equal(lsBId, page.Items[1].LinkshellId);
        Assert.Equal("BetaShell", page.Items[1].Name);
        Assert.Equal(600, page.Items[1].TotalScore);
        Assert.Equal(2, page.Items[1].Rank);

        // LS-C must be absent
        Assert.DoesNotContain(page.Items, i => i.Name == "EmptyShell");
    }

    /// <summary>
    /// sort=average: ordered by AverageScore DESC — expects [B(300), A(250)].
    /// Ranks re-base: B=1, A=2.
    /// </summary>
    [Fact]
    public async Task GetLinkshellLeaderboard_SortAverage_ReturnsOrderedByAverageScore()
    {
        var (lsAId, lsBId, _) = await SeedLinkshellsAsync(_factory, "Bahamut");

        var resp = await _client.GetAsync("/api/leaderboards/linkshells?server=Bahamut&sort=average");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var page = (await resp.Content.ReadFromJsonAsync<LeaderboardPage<LinkshellLeaderboardEntry>>())!;

        Assert.Equal(2, page.Total);
        Assert.Equal(2, page.Items.Count);

        // First: LS-B (avg=300)
        Assert.Equal(lsBId, page.Items[0].LinkshellId);
        Assert.Equal(300.0, page.Items[0].AverageScore);
        Assert.Equal(1, page.Items[0].Rank);

        // Second: LS-A (avg=250)
        Assert.Equal(lsAId, page.Items[1].LinkshellId);
        Assert.Equal(250.0, page.Items[1].AverageScore);
        Assert.Equal(2, page.Items[1].Rank);

        // LS-C must be absent
        Assert.DoesNotContain(page.Items, i => i.Name == "EmptyShell");
    }

    /// <summary>
    /// sort=members: ordered by RankedMemberCount DESC — expects [A(4), B(2)].
    /// Ranks: A=1, B=2.
    /// </summary>
    [Fact]
    public async Task GetLinkshellLeaderboard_SortMembers_ReturnsOrderedByMemberCount()
    {
        var (lsAId, lsBId, _) = await SeedLinkshellsAsync(_factory, "Carbuncle");

        var resp = await _client.GetAsync("/api/leaderboards/linkshells?server=Carbuncle&sort=members");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var page = (await resp.Content.ReadFromJsonAsync<LeaderboardPage<LinkshellLeaderboardEntry>>())!;

        Assert.Equal(2, page.Total);
        Assert.Equal(2, page.Items.Count);

        // First: LS-A (members=4)
        Assert.Equal(lsAId, page.Items[0].LinkshellId);
        Assert.Equal(4, page.Items[0].RankedMemberCount);
        Assert.Equal(1, page.Items[0].Rank);

        // Second: LS-B (members=2)
        Assert.Equal(lsBId, page.Items[1].LinkshellId);
        Assert.Equal(2, page.Items[1].RankedMemberCount);
        Assert.Equal(2, page.Items[1].Rank);

        // LS-C must be absent
        Assert.DoesNotContain(page.Items, i => i.Name == "EmptyShell");
    }

    /// <summary>
    /// ColorRgb is populated from the Linkshell entity (non-nullable int).
    /// </summary>
    [Fact]
    public async Task GetLinkshellLeaderboard_ColorRgb_IsPopulatedCorrectly()
    {
        var (lsAId, _, _) = await SeedLinkshellsAsync(_factory, "Diabolos");

        var resp = await _client.GetAsync("/api/leaderboards/linkshells?server=Diabolos&sort=total");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var page = (await resp.Content.ReadFromJsonAsync<LeaderboardPage<LinkshellLeaderboardEntry>>())!;

        var entryA = page.Items.First(i => i.LinkshellId == lsAId);
        Assert.Equal(0xFF0000, entryA.ColorRgb);
    }

    /// <summary>
    /// Privacy gate: a PRIVATE linkshell (IsPublic=false) with RankedMemberCount > 0
    /// must be excluded from the leaderboard; only the PUBLIC linkshell appears.
    /// </summary>
    [Fact]
    public async Task GetLinkshellLeaderboard_PrivateLinkshell_IsExcluded()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var publicLs = new Linkshell
        {
            Id = Guid.NewGuid(),
            Server = "Fenrir",
            GameLinkshellId = 2001L,
            Name = "PublicShell",
            ColorRgb = 0x111111,
            IsPublic = true,
            FirstSeenAt = DateTimeOffset.UtcNow,
            LastSeenAt = DateTimeOffset.UtcNow,
        };
        var privateLs = new Linkshell
        {
            Id = Guid.NewGuid(),
            Server = "Fenrir",
            GameLinkshellId = 2002L,
            Name = "PrivateShell",
            ColorRgb = 0x222222,
            IsPublic = false,
            FirstSeenAt = DateTimeOffset.UtcNow,
            LastSeenAt = DateTimeOffset.UtcNow,
        };
        db.Linkshells.AddRange(publicLs, privateLs);
        await db.SaveChangesAsync();

        db.LinkshellAchievements.AddRange(
            new LinkshellAchievement
            {
                LinkshellId = publicLs.Id,
                TotalScore = 500,
                AverageScore = 250.0,
                RankedMemberCount = 2,
                ComputedAt = DateTimeOffset.UtcNow,
            },
            new LinkshellAchievement
            {
                LinkshellId = privateLs.Id,
                TotalScore = 800,
                AverageScore = 400.0,
                RankedMemberCount = 2,
                ComputedAt = DateTimeOffset.UtcNow,
            }
        );
        await db.SaveChangesAsync();

        var resp = await _client.GetAsync("/api/leaderboards/linkshells?server=Fenrir");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var page = (await resp.Content.ReadFromJsonAsync<LeaderboardPage<LinkshellLeaderboardEntry>>())!;

        // Only the public linkshell should appear
        Assert.Equal(1, page.Total);
        Assert.Single(page.Items);
        Assert.Equal(publicLs.Id, page.Items[0].LinkshellId);
        Assert.Equal("PublicShell", page.Items[0].Name);

        // Private linkshell must be absent even though it has a higher score
        Assert.DoesNotContain(page.Items, i => i.Name == "PrivateShell");
    }
}
