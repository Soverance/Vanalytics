using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Vanalytics.Api.Services;
using Vanalytics.Api.Tests.Achievements;
using Vanalytics.Core.DTOs.Analytics;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class AnalyticsTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var desc = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<VanalyticsDbContext>));
                if (desc != null) services.Remove(desc);
                services.AddDbContext<VanalyticsDbContext>(o => o.UseSqlServer(_container.GetConnectionString()));
            });
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = "TestSecretKeyThatIsAtLeast32BytesLongForHmacSha256!!",
                ["Jwt:Issuer"] = "VanalyticsTest",
                ["Jwt:Audience"] = "VanalyticsTest",
                ["Jwt:AccessTokenExpirationMinutes"] = "15",
                ["Jwt:RefreshTokenExpirationDays"] = "7",
            }));
        });
        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _container.DisposeAsync();
    }

    // Seed helper: run arbitrary seeding in a scope and save.
    private async Task SeedAsync(Action<VanalyticsDbContext> seed)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        seed(db);
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// Fact 1: A non-public character owning Spharai (Relic, Level=99, ItemLevel=119)
    /// should appear in OwnedUltimateWeaponsAsync for that server, with Category=Relic
    /// and Rank >= 75 (actually 900 for Reforged). Non-public chars ARE included
    /// (analytics never filters by IsPublic).
    /// </summary>
    [Fact]
    public async Task OwnedUltimateWeapons_counts_nonpublic_owner_and_respects_server_scope()
    {
        await SeedAsync(db =>
        {
            // Level=99, ItemLevel=119 → UltimateWeaponStage.Rank returns 900 ("Reforged") — well above 75.
            var item = new GameItem
            {
                ItemId = 18264,
                Name = "Spharai",
                Level = 99,
                ItemLevel = 119,
                Description = "DMG:...",
                Category = "Hand-to-Hand"
            };
            db.GameItems.Add(item);
            var u = TestData.AddUser(db);
            var owner = TestData.AddCharacter(db, u.Id, "UwOwner", "AzUw", isPublic: false);
            db.CharacterInventories.Add(new CharacterInventory { CharacterId = owner.Id, ItemId = item.ItemId });
        });

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var svc = new AnalyticsService(db);
        var owned = await svc.OwnedUltimateWeaponsAsync(server: "AzUw");

        var spharai = Assert.Single(owned, w => w.Weapon == "Spharai");
        Assert.Equal("Relic", spharai.Category);
        Assert.True(spharai.Rank >= 75);
    }

    // -------------------------------------------------------------------------
    // Task 3: GET /api/analytics/jobs endpoint facts
    // -------------------------------------------------------------------------

    /// <summary>
    /// Jobs maxed mode: only level-99 jobs are counted.
    /// Seeds WAR@99 + BLM@75 on server "AzJobsMaxed"; expects WAR in result, BLM absent.
    /// </summary>
    [Fact]
    public async Task Jobs_maxed_counts_level_99_jobs_per_code()
    {
        await SeedAsync(db =>
        {
            var u = TestData.AddUser(db);
            var c = TestData.AddCharacter(db, u.Id, "JobsMaxedChar", "AzJobsMaxed", isPublic: false);
            db.CharacterJobs.AddRange(
                new CharacterJob { Id = Guid.NewGuid(), CharacterId = c.Id, JobId = JobType.WAR, Level = 99 },
                new CharacterJob { Id = Guid.NewGuid(), CharacterId = c.Id, JobId = JobType.BLM, Level = 75 });
        });

        var data = (await _client.GetFromJsonAsync<List<JobPopularityEntry>>(
            "/api/analytics/jobs?server=AzJobsMaxed&mode=maxed"))!;

        Assert.Contains(data, e => e.Job == "WAR" && e.Count == 1);
        Assert.DoesNotContain(data, e => e.Job == "BLM"); // BLM is only 75, not 99
    }

    /// <summary>
    /// Jobs mained mode: per character, the single highest-level job is counted.
    /// Seeds one character with WAR@99 + BLM@75; the "main" is WAR.
    /// Seeds a second character with only MNK@50; the "main" is MNK.
    /// WAR count=1, MNK count=1, BLM should not appear.
    /// </summary>
    [Fact]
    public async Task Jobs_mained_counts_highest_level_job_per_character()
    {
        await SeedAsync(db =>
        {
            var u1 = TestData.AddUser(db);
            var c1 = TestData.AddCharacter(db, u1.Id, "JobsMainedChar1", "AzJobsMained", isPublic: false);
            db.CharacterJobs.AddRange(
                new CharacterJob { Id = Guid.NewGuid(), CharacterId = c1.Id, JobId = JobType.WAR, Level = 99 },
                new CharacterJob { Id = Guid.NewGuid(), CharacterId = c1.Id, JobId = JobType.BLM, Level = 75 });

            var u2 = TestData.AddUser(db);
            var c2 = TestData.AddCharacter(db, u2.Id, "JobsMainedChar2", "AzJobsMained", isPublic: true);
            db.CharacterJobs.Add(
                new CharacterJob { Id = Guid.NewGuid(), CharacterId = c2.Id, JobId = JobType.MNK, Level = 50 });
        });

        var data = (await _client.GetFromJsonAsync<List<JobPopularityEntry>>(
            "/api/analytics/jobs?server=AzJobsMained&mode=mained"))!;

        // c1's main is WAR (highest); c2's main is MNK (only job)
        Assert.Contains(data, e => e.Job == "WAR" && e.Count == 1);
        Assert.Contains(data, e => e.Job == "MNK" && e.Count == 1);
        // BLM is not the highest for any character
        Assert.DoesNotContain(data, e => e.Job == "BLM");
    }

    // -------------------------------------------------------------------------
    // Task 4: GET /api/analytics/servers + GET /api/analytics/summary
    // -------------------------------------------------------------------------

    /// <summary>
    /// Servers population metric: counts ALL synced characters (incl. non-public).
    /// Seeds 2 chars on SvrPopA and 1 on SvrPopB. Finds both in the all-worlds result
    /// and asserts SvrPopA.Value == 2, SvrPopB.Value == 1, and SvrPopA ranks above SvrPopB.
    /// Uses unique server names to avoid interference from other facts.
    /// </summary>
    [Fact]
    public async Task Servers_population_ranks_worlds_desc_and_counts_all_synced()
    {
        await SeedAsync(db =>
        {
            var u1 = TestData.AddUser(db);
            var u2 = TestData.AddUser(db);
            var u3 = TestData.AddUser(db);
            TestData.AddCharacter(db, u1.Id, "SvrPopA_1", "SvrPopA", isPublic: false);
            TestData.AddCharacter(db, u2.Id, "SvrPopA_2", "SvrPopA", isPublic: true);
            TestData.AddCharacter(db, u3.Id, "SvrPopB_1", "SvrPopB", isPublic: true);
        });

        var data = (await _client.GetFromJsonAsync<List<ServerComparisonEntry>>(
            "/api/analytics/servers?metric=population"))!;

        var popA = Assert.Single(data, e => e.Server == "SvrPopA");
        var popB = Assert.Single(data, e => e.Server == "SvrPopB");

        Assert.Equal(2, popA.Value);
        Assert.Equal(1, popB.Value);

        // SvrPopA (2 chars) must rank above SvrPopB (1 char) in the desc-sorted result.
        var idxA = data.IndexOf(popA);
        var idxB = data.IndexOf(popB);
        Assert.True(idxA < idxB, $"Expected SvrPopA (idx {idxA}) to rank above SvrPopB (idx {idxB})");
    }

    /// <summary>
    /// Summary endpoint: scoped to a specific server, returns character count, jobs-mastered count,
    /// worlds count (1 for a specific-server query), and ultimate weapon count.
    /// Seeds 1 character on SvrSumX with WAR@99 + Spharai (Level=99, ItemLevel=119);
    /// expects Characters=1, JobsMastered=1, Worlds=1, UltimateWeapons=1.
    /// Uses unique server name "SvrSumX" for cache isolation.
    /// </summary>
    [Fact]
    public async Task Summary_counts_characters_and_jobs_mastered_in_scope()
    {
        await SeedAsync(db =>
        {
            var item = new GameItem
            {
                ItemId = 18270,
                Name = "Spharai",
                Level = 99,
                ItemLevel = 119,
                Description = "DMG:...",
                Category = "Hand-to-Hand"
            };
            db.GameItems.Add(item);
            var u = TestData.AddUser(db);
            var c = TestData.AddCharacter(db, u.Id, "SvrSumChar", "SvrSumX", isPublic: false);
            db.CharacterJobs.Add(new CharacterJob
            {
                Id = Guid.NewGuid(),
                CharacterId = c.Id,
                JobId = JobType.WAR,
                Level = 99
            });
            db.CharacterInventories.Add(new CharacterInventory { CharacterId = c.Id, ItemId = item.ItemId });
        });

        var s = (await _client.GetFromJsonAsync<AnalyticsSummary>(
            "/api/analytics/summary?server=SvrSumX"))!;

        Assert.Equal(1, s.Characters);
        Assert.Equal(1, s.JobsMastered);
        Assert.Equal(1, s.Worlds);
        Assert.Equal(1, s.UltimateWeapons);
    }

    // -------------------------------------------------------------------------
    // Task 5: GET /api/analytics/ultimate-weapons endpoint fact
    // -------------------------------------------------------------------------

    /// <summary>
    /// Ultimate-weapons endpoint: 1 owner + 1 non-owner on server "AzUwRarity".
    /// Spharai (Level=99, ItemLevel=119) → Rank 900 ≥ 75.
    /// Percent = 1/2 synced chars = 50.0.
    /// </summary>
    [Fact]
    public async Task UltimateWeapons_reports_owner_count_and_percent()
    {
        await SeedAsync(db =>
        {
            var item = new GameItem
            {
                ItemId = 18266,
                Name = "Spharai",
                Level = 99,
                ItemLevel = 119,
                Description = "DMG:...",
                Category = "Hand-to-Hand"
            };
            db.GameItems.Add(item);
            var u1 = TestData.AddUser(db);
            var owner = TestData.AddCharacter(db, u1.Id, "UwRarityOwner", "AzUwRarity", isPublic: false);
            db.CharacterInventories.Add(new CharacterInventory { CharacterId = owner.Id, ItemId = item.ItemId });
            var u2 = TestData.AddUser(db);
            TestData.AddCharacter(db, u2.Id, "UwRarityNonOwner", "AzUwRarity", isPublic: false);
        });

        var data = (await _client.GetFromJsonAsync<List<UltimateWeaponRarityEntry>>(
            "/api/analytics/ultimate-weapons?server=AzUwRarity"))!;

        var spharai = Assert.Single(data, e => e.Weapon == "Spharai");
        Assert.Equal(1, spharai.Owners);
        Assert.Equal(50.0, spharai.Percent); // 1 of 2 synced chars in AzUwRarity
    }

    /// <summary>
    /// Fact 2: Two characters on different servers both own Spharai.
    /// Querying with server="AzUw2" returns only the AzUw2 character;
    /// the Asura character is excluded. Both are in inventory (one non-public).
    /// </summary>
    [Fact]
    public async Task OwnedUltimateWeapons_server_scope_excludes_other_servers()
    {
        await SeedAsync(db =>
        {
            // Use a different ItemId to avoid collision with Fact 1's seeded item.
            var item = new GameItem
            {
                ItemId = 18265,
                Name = "Spharai",
                Level = 99,
                ItemLevel = 119,
                Description = "DMG:...",
                Category = "Hand-to-Hand"
            };
            db.GameItems.Add(item);

            var u1 = TestData.AddUser(db);
            var sirenChar = TestData.AddCharacter(db, u1.Id, "SirenOwner2", "AzUw2", isPublic: false);

            var u2 = TestData.AddUser(db);
            var asuraChar = TestData.AddCharacter(db, u2.Id, "AsuraOwner2", "AzAsura2", isPublic: true);

            db.CharacterInventories.AddRange(
                new CharacterInventory { CharacterId = sirenChar.Id, ItemId = item.ItemId },
                new CharacterInventory { CharacterId = asuraChar.Id, ItemId = item.ItemId });
        });

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var svc = new AnalyticsService(db);
        var sirenOnly = await svc.OwnedUltimateWeaponsAsync(server: "AzUw2");

        // Only the AzUw2 character should appear
        Assert.Single(sirenOnly);
        Assert.Equal("AzUw2", sirenOnly[0].Server);
    }
}
