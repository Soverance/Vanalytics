using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Soverance.Auth.DTOs;
using Vanalytics.Api.DTOs;
using Vanalytics.Core.DTOs.Characters;
using Vanalytics.Core.DTOs.Keys;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class LinkshellBrowserTests : IAsyncLifetime
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

    // Creates a user + API key, syncs one character carrying one linkshell, and
    // optionally makes the character public. Multiple calls with the same
    // (lsId, lsName, server) put several characters into the same linkshell.
    private async Task SeedMemberAsync(
        string email, string username, string charName, string server,
        long lsId, string lsName, int colorRgb, string rank, bool isPublic, string job = "WAR")
    {
        // user + login
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            db.Users.Add(new Soverance.Auth.Models.User
            {
                Id = Guid.NewGuid(),
                Email = email,
                Username = username,
                PasswordHash = Soverance.Auth.Services.PasswordHasher.HashPassword("Password123!"),
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
        }
        var login = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest { Email = email, Password = "Password123!" });
        var token = (await login.Content.ReadFromJsonAsync<AuthResponse>())!.AccessToken;

        // api key
        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var apiKey = (await (await _client.SendAsync(keyReq)).Content.ReadFromJsonAsync<ApiKeyResponse>())!;

        // sync with one linkshell
        var syncReq = new HttpRequestMessage(HttpMethod.Post, "/api/sync");
        syncReq.Headers.Add("X-Api-Key", apiKey.ApiKey);
        syncReq.Content = JsonContent.Create(new SyncRequest
        {
            CharacterName = charName,
            Server = server,
            ActiveJob = job,
            ActiveJobLevel = 99,
            Jobs = [new SyncJobEntry { Job = job, Level = 99 }],
            Linkshells = [new SyncLinkshellEntry { LinkshellId = lsId, Name = lsName, ColorRgb = colorRgb, Rank = rank }]
        });
        var syncResp = await _client.SendAsync(syncReq);
        Assert.True(syncResp.IsSuccessStatusCode,
            $"Seed sync failed ({(int)syncResp.StatusCode}): {await syncResp.Content.ReadAsStringAsync()}");

        if (!isPublic) return;

        // make character public
        var listReq = new HttpRequestMessage(HttpMethod.Get, "/api/characters");
        listReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var chars = (await (await _client.SendAsync(listReq)).Content.ReadFromJsonAsync<List<CharacterSummaryResponse>>())!;
        var character = chars.First(c => c.Name == charName);
        var updateReq = new HttpRequestMessage(HttpMethod.Put, $"/api/characters/{character.Id}");
        updateReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        updateReq.Content = JsonContent.Create(new UpdateCharacterRequest { IsPublic = true });
        await _client.SendAsync(updateReq);
    }

    [Fact]
    public async Task GetDirectory_ListsLinkshellsWithMemberCounts()
    {
        await SeedMemberAsync("d1a@test.com", "d1a", "DirA", "Asura", 7001, "DirShell", 0xFF0000, "leader", isPublic: true);
        await SeedMemberAsync("d1b@test.com", "d1b", "DirB", "Asura", 7001, "DirShell", 0xFF0000, "member", isPublic: false);

        var list = await _client.GetFromJsonAsync<List<LinkshellListItem>>("/api/linkshells?server=Asura");

        Assert.NotNull(list);
        var ls = Assert.Single(list!, x => x.Name == "DirShell");
        Assert.Equal(2, ls.MemberCount);
        Assert.Equal(1, ls.PublicMemberCount); // only DirA is public
        Assert.Equal(0xFF0000, ls.ColorRgb);
    }

    [Fact]
    public async Task GetDirectory_FiltersByServer()
    {
        await SeedMemberAsync("d2a@test.com", "d2a", "SrvA", "Asura", 7101, "AsuraShell", 1, "leader", isPublic: true);
        await SeedMemberAsync("d2b@test.com", "d2b", "SrvB", "Bahamut", 7102, "BahaShell", 1, "leader", isPublic: true);

        var asura = await _client.GetFromJsonAsync<List<LinkshellListItem>>("/api/linkshells?server=Asura");

        Assert.NotNull(asura);
        Assert.Contains(asura!, x => x.Name == "AsuraShell");
        Assert.DoesNotContain(asura!, x => x.Name == "BahaShell");
    }

    [Fact]
    public async Task GetProfile_NamesPublicMembers_CountsPrivate_SortsRankThenName()
    {
        // Same LS (8001 "RosterShell"): a private leader, a public sackholder, two public members.
        await SeedMemberAsync("p1a@test.com", "p1a", "Zelda",  "Asura", 8001, "RosterShell", 0x00FF00, "leader",     isPublic: false);
        await SeedMemberAsync("p1b@test.com", "p1b", "Aaron",  "Asura", 8001, "RosterShell", 0x00FF00, "sackholder", isPublic: true);
        await SeedMemberAsync("p1c@test.com", "p1c", "Yvonne", "Asura", 8001, "RosterShell", 0x00FF00, "member",     isPublic: true);
        await SeedMemberAsync("p1d@test.com", "p1d", "Brett",  "Asura", 8001, "RosterShell", 0x00FF00, "member",     isPublic: true);

        var profile = await _client.GetFromJsonAsync<LinkshellProfile>("/api/linkshells/Asura/RosterShell");

        Assert.NotNull(profile);
        Assert.Equal(4, profile!.MemberCount);
        Assert.Equal(3, profile.PublicMemberCount);
        Assert.Equal(1, profile.PrivateMemberCount);     // the private leader Zelda
        Assert.Equal("Unknown", profile.RecruitmentStatus);

        // Only public members are named; sorted Sackholder, then Members alphabetically.
        Assert.Equal(3, profile.Members.Count);
        Assert.Equal(new[] { "Aaron", "Brett", "Yvonne" }, profile.Members.Select(m => m.Name).ToArray());
        Assert.Equal("Sackholder", profile.Members[0].Rank);
        Assert.Equal("WAR", profile.Members[0].Job);
        Assert.Equal(99, profile.Members[0].Level);
        Assert.DoesNotContain(profile.Members, m => m.Name == "Zelda"); // private, never named
    }

    [Fact]
    public async Task GetProfile_OrdersLeaderAboveSackholderAboveMember()
    {
        // All public so the full rank order is exercised. Seed out of order
        // (member, leader, sackholder) and alphabetically scrambled to prove the
        // endpoint sorts by rank first, then name — not insertion order.
        await SeedMemberAsync("o1@test.com", "o1", "Mona",  "Asura", 8201, "OrderShell", 1, "member",     isPublic: true);
        await SeedMemberAsync("o2@test.com", "o2", "Liana", "Asura", 8201, "OrderShell", 1, "leader",     isPublic: true);
        await SeedMemberAsync("o3@test.com", "o3", "Sara",  "Asura", 8201, "OrderShell", 1, "sackholder", isPublic: true);
        await SeedMemberAsync("o4@test.com", "o4", "Alma",  "Asura", 8201, "OrderShell", 1, "member",     isPublic: true);

        var profile = await _client.GetFromJsonAsync<LinkshellProfile>("/api/linkshells/Asura/OrderShell");

        Assert.NotNull(profile);
        // Leader, then Sackholder, then Members alphabetically (Alma before Mona).
        Assert.Equal(new[] { "Liana", "Sara", "Alma", "Mona" }, profile!.Members.Select(m => m.Name).ToArray());
        Assert.Equal(new[] { "Leader", "Sackholder", "Member", "Member" }, profile.Members.Select(m => m.Rank).ToArray());
    }

    [Fact]
    public async Task GetProfile_UnknownName_Returns404()
    {
        var resp = await _client.GetAsync("/api/linkshells/Asura/NoSuchShell");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task GetProfile_ExcludesFormerMembers()
    {
        // Char joins LS 8101 then swaps it out: re-sync with a different LS flips
        // the first membership to IsCurrent = false (Phase 1 freshness behavior).
        await SeedMemberAsync("p3@test.com", "p3", "Switcher", "Asura", 8101, "OldShell", 1, "member", isPublic: true);

        // Re-sync the same character with a different linkshell only.
        var login = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest { Email = "p3@test.com", Password = "Password123!" });
        var token = (await login.Content.ReadFromJsonAsync<AuthResponse>())!.AccessToken;
        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var apiKey = (await (await _client.SendAsync(keyReq)).Content.ReadFromJsonAsync<ApiKeyResponse>())!;
        var syncReq = new HttpRequestMessage(HttpMethod.Post, "/api/sync");
        syncReq.Headers.Add("X-Api-Key", apiKey.ApiKey);
        syncReq.Content = JsonContent.Create(new SyncRequest
        {
            CharacterName = "Switcher",
            Server = "Asura",
            ActiveJob = "WAR",
            ActiveJobLevel = 99,
            Linkshells = [new SyncLinkshellEntry { LinkshellId = 8102, Name = "NewShell", ColorRgb = 1, Rank = "member" }]
        });
        var reSyncResp = await _client.SendAsync(syncReq);
        Assert.True(reSyncResp.IsSuccessStatusCode,
            $"Re-sync failed ({(int)reSyncResp.StatusCode}): {await reSyncResp.Content.ReadAsStringAsync()}");

        var resp = await _client.GetAsync("/api/linkshells/Asura/OldShell");
        // OldShell now has 0 current members -> MemberCount 0 -> not resolvable.
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }
}
