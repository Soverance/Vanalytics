using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Vanalytics.Core.Models;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Api.Tests.Achievements;

public class AchievementSchemaTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container =
        new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private ServiceProvider _sp = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        var services = new ServiceCollection();
        services.AddDbContext<VanalyticsDbContext>(o => o.UseSqlServer(_container.GetConnectionString()));
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
    public async Task CharacterAchievement_RoundTrips()
    {
        using var scope = _sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var user = TestData.AddUser(db);
        var ch = TestData.AddCharacter(db, user.Id, "Tester", "Asura", isPublic: true);
        await db.SaveChangesAsync();

        db.CharacterAchievements.Add(new CharacterAchievement
        {
            CharacterId = ch.Id, TotalScore = 1234, BreakdownJson = "[]",
            RubricVersion = 1, ComputedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();

        var loaded = await db.CharacterAchievements.SingleAsync(a => a.CharacterId == ch.Id);
        Assert.Equal(1234, loaded.TotalScore);
    }
}
