using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Vanalytics.Api.Services;
using Vanalytics.Core.Models;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Api.Tests.Achievements;

public class AchievementRecomputeTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container =
        new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private ServiceProvider _sp = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        var services = new ServiceCollection();
        services.AddDbContext<VanalyticsDbContext>(o => o.UseSqlServer(_container.GetConnectionString()));
        services.AddScoped<AchievementRecomputeService>();
        _sp = services.BuildServiceProvider();
        using var scope = _sp.CreateScope();
        await scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>().Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        await _sp.DisposeAsync();
        await _container.DisposeAsync();
    }

    [Fact]
    public async Task RecomputeCharacter_WritesScore()
    {
        using var scope = _sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var svc = scope.ServiceProvider.GetRequiredService<AchievementRecomputeService>();

        var user = TestData.AddUser(db);
        var ch = TestData.AddCharacter(db, user.Id, "Hero", "Asura", isPublic: true);
        db.CharacterJobs.Add(new CharacterJob { Id = Guid.NewGuid(), CharacterId = ch.Id, Level = 99, IsActive = true });
        await db.SaveChangesAsync();

        await svc.RecomputeCharacterAsync(ch.Id);

        var a = await db.CharacterAchievements.SingleAsync(x => x.CharacterId == ch.Id);
        Assert.Equal(99, a.TotalScore); // one job at level 99 → 99 pts (1 pt/level)
        Assert.Equal(2, a.RubricVersion);
    }

    [Fact]
    public async Task RecomputeLinkshell_AggregatesPublicMembersOnly()
    {
        using var scope = _sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var svc = scope.ServiceProvider.GetRequiredService<AchievementRecomputeService>();

        var user = TestData.AddUser(db);
        var pub = TestData.AddCharacter(db, user.Id, "Pub", "Asura", isPublic: true);
        var priv = TestData.AddCharacter(db, user.Id, "Priv", "Asura", isPublic: false);
        var ls = new Linkshell { Id = Guid.NewGuid(), Server = "Asura", GameLinkshellId = 1, Name = "LS", FirstSeenAt = DateTimeOffset.UtcNow, LastSeenAt = DateTimeOffset.UtcNow };
        db.Linkshells.Add(ls);
        db.LinkshellMemberships.Add(new LinkshellMembership { Id = Guid.NewGuid(), CharacterId = pub.Id, LinkshellId = ls.Id, IsCurrent = true, FirstSeenAt = DateTimeOffset.UtcNow, LastSeenAt = DateTimeOffset.UtcNow });
        db.LinkshellMemberships.Add(new LinkshellMembership { Id = Guid.NewGuid(), CharacterId = priv.Id, LinkshellId = ls.Id, IsCurrent = true, FirstSeenAt = DateTimeOffset.UtcNow, LastSeenAt = DateTimeOffset.UtcNow });
        db.CharacterAchievements.Add(new CharacterAchievement { CharacterId = pub.Id, TotalScore = 100, BreakdownJson = "[]", RubricVersion = 1, ComputedAt = DateTimeOffset.UtcNow });
        db.CharacterAchievements.Add(new CharacterAchievement { CharacterId = priv.Id, TotalScore = 999, BreakdownJson = "[]", RubricVersion = 1, ComputedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();

        await svc.RecomputeLinkshellAsync(ls.Id);

        var agg = await db.LinkshellAchievements.SingleAsync(x => x.LinkshellId == ls.Id);
        Assert.Equal(100, agg.TotalScore);      // private member excluded
        Assert.Equal(1, agg.RankedMemberCount);
        Assert.Equal(100.0, agg.AverageScore);
    }
}
