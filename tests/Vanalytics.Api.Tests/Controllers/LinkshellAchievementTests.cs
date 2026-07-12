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
using Vanalytics.Api.Tests.Achievements;

namespace Vanalytics.Api.Tests.Controllers;

public class LinkshellAchievementTests : IAsyncLifetime
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
    /// Seeds a linkshell with a LinkshellAchievement (total 300, avg 150, members 2),
    /// two PUBLIC members (scores 200, 100), and one PRIVATE member (excluded).
    /// Returns the linkshell Guid.
    /// </summary>
    private async Task<Guid> SeedLinkshellScenarioAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        // Users
        var user1 = TestData.AddUser(db);
        var user2 = TestData.AddUser(db);
        var user3 = TestData.AddUser(db);

        // Linkshell
        var ls = new Linkshell
        {
            Id = Guid.NewGuid(),
            GameLinkshellId = 99999L,
            Name = "AchievementTestLS",
            Server = "Asura",
            ColorRgb = 0xFF0000,
            MemberCount = 3,
            IsPublic = true,
            FirstSeenAt = DateTimeOffset.UtcNow,
            LastSeenAt = DateTimeOffset.UtcNow,
        };
        db.Linkshells.Add(ls);

        // LinkshellAchievement aggregate
        db.LinkshellAchievements.Add(new LinkshellAchievement
        {
            LinkshellId = ls.Id,
            TotalScore = 300,
            AverageScore = 150.0,
            RankedMemberCount = 2,
            ComputedAt = DateTimeOffset.UtcNow,
        });

        // Characters: two PUBLIC, one PRIVATE
        var charPublic1 = TestData.AddCharacter(db, user1.Id, "PubMember1", "Asura", isPublic: true);
        var charPublic2 = TestData.AddCharacter(db, user2.Id, "PubMember2", "Asura", isPublic: true);
        var charPrivate = TestData.AddCharacter(db, user3.Id, "PrivMember", "Asura", isPublic: false);

        await db.SaveChangesAsync();

        // Memberships (current)
        db.LinkshellMemberships.Add(new LinkshellMembership
        {
            Id = Guid.NewGuid(),
            LinkshellId = ls.Id,
            CharacterId = charPublic1.Id,
            Slot = 1,
            Rank = Vanalytics.Core.Enums.LinkshellRank.Member,
            IsCurrent = true,
            FirstSeenAt = DateTimeOffset.UtcNow,
            LastSeenAt = DateTimeOffset.UtcNow,
        });
        db.LinkshellMemberships.Add(new LinkshellMembership
        {
            Id = Guid.NewGuid(),
            LinkshellId = ls.Id,
            CharacterId = charPublic2.Id,
            Slot = 1,
            Rank = Vanalytics.Core.Enums.LinkshellRank.Member,
            IsCurrent = true,
            FirstSeenAt = DateTimeOffset.UtcNow,
            LastSeenAt = DateTimeOffset.UtcNow,
        });
        db.LinkshellMemberships.Add(new LinkshellMembership
        {
            Id = Guid.NewGuid(),
            LinkshellId = ls.Id,
            CharacterId = charPrivate.Id,
            Slot = 1,
            Rank = Vanalytics.Core.Enums.LinkshellRank.Member,
            IsCurrent = true,
            FirstSeenAt = DateTimeOffset.UtcNow,
            LastSeenAt = DateTimeOffset.UtcNow,
        });

        // CharacterAchievements: pub1=200, pub2=100, private=50
        db.CharacterAchievements.Add(new CharacterAchievement
        {
            CharacterId = charPublic1.Id,
            TotalScore = 200,
            BreakdownJson = "[]",
            RubricVersion = 1,
            ComputedAt = DateTimeOffset.UtcNow,
        });
        db.CharacterAchievements.Add(new CharacterAchievement
        {
            CharacterId = charPublic2.Id,
            TotalScore = 100,
            BreakdownJson = "[]",
            RubricVersion = 1,
            ComputedAt = DateTimeOffset.UtcNow,
        });
        db.CharacterAchievements.Add(new CharacterAchievement
        {
            CharacterId = charPrivate.Id,
            TotalScore = 50,
            BreakdownJson = "[]",
            RubricVersion = 1,
            ComputedAt = DateTimeOffset.UtcNow,
        });

        await db.SaveChangesAsync();
        return ls.Id;
    }

    [Fact]
    public async Task GetAchievement_ValidLinkshell_Returns200WithCorrectData()
    {
        var lsId = await SeedLinkshellScenarioAsync();

        var resp = await _client.GetAsync($"/api/linkshells/{lsId}/achievement");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = (await resp.Content.ReadFromJsonAsync<LinkshellAchievementResponse>())!;

        // Aggregate fields
        Assert.Equal(300, body.TotalScore);
        Assert.Equal(150.0, body.AverageScore);
        Assert.Equal(2, body.RankedMemberCount);

        // Members: only the two PUBLIC members, ordered by score desc
        Assert.Equal(2, body.Members.Count);
        Assert.Equal(200, body.Members[0].TotalScore);
        Assert.Equal(100, body.Members[1].TotalScore);

        // Ranks within the LS are 1-based
        Assert.Equal(1, body.Members[0].Rank);
        Assert.Equal(2, body.Members[1].Rank);

        // Private member is excluded
        Assert.DoesNotContain(body.Members, m => m.Name == "PrivMember");

        // This is the only ranked LS in the seed, so both ranks are 1
        Assert.Equal(1, body.GlobalRank);
        Assert.Equal(1, body.ServerRank);
    }

    [Fact]
    public async Task GetAchievement_UnknownLinkshell_Returns404()
    {
        var resp = await _client.GetAsync($"/api/linkshells/{Guid.NewGuid()}/achievement");

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    /// <summary>
    /// Privacy gate: an anonymous caller requesting achievement data for a PRIVATE
    /// linkshell (IsPublic=false) must receive 404 (not 200 leaking private data).
    /// </summary>
    [Fact]
    public async Task GetAchievement_PrivateLinkshell_AnonymousCaller_Returns404()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var privateLs = new Linkshell
        {
            Id = Guid.NewGuid(),
            GameLinkshellId = 88888L,
            Name = "SecretShell",
            Server = "Asura",
            ColorRgb = 0xAAAAAA,
            MemberCount = 1,
            IsPublic = false,
            FirstSeenAt = DateTimeOffset.UtcNow,
            LastSeenAt = DateTimeOffset.UtcNow,
        };
        db.Linkshells.Add(privateLs);
        db.LinkshellAchievements.Add(new LinkshellAchievement
        {
            LinkshellId = privateLs.Id,
            TotalScore = 500,
            AverageScore = 500.0,
            RankedMemberCount = 1,
            ComputedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync();

        // Anonymous caller — no Authorization header
        var resp = await _client.GetAsync($"/api/linkshells/{privateLs.Id}/achievement");

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }
}
