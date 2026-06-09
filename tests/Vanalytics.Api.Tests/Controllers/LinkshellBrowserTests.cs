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

        var profile = await _client.GetFromJsonAsync<LinkshellProfileResponse>("/api/linkshells/Asura/RosterShell");

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

        Assert.False(profile.CanManage); // anonymous request -> never manageable
        Assert.Null(profile.Profile);    // no profile row yet -> null
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

        var profile = await _client.GetFromJsonAsync<LinkshellProfileResponse>("/api/linkshells/Asura/OrderShell");

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

    // === Phase 3: profile management ===

    private async Task<string> LoginAsync(string email)
    {
        var login = await _client.PostAsJsonAsync("/api/auth/login",
            new LoginRequest { Email = email, Password = "Password123!" });
        return (await login.Content.ReadFromJsonAsync<AuthResponse>())!.AccessToken;
    }

    private async Task<Guid> LinkshellIdAsync(string server, string name)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        return await db.Linkshells
            .Where(l => l.Server == server && l.Name == name)
            .Select(l => l.Id).FirstAsync();
    }

    private static HttpRequestMessage Authed(HttpMethod method, string url, string token, object? body = null)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body != null) req.Content = JsonContent.Create(body);
        return req;
    }

    [Fact]
    public async Task PutProfile_AsLeader_CreatesProfile_AndShowsCanManage()
    {
        await SeedMemberAsync("m1@test.com", "m1", "Boss", "Asura", 9001, "MyShell", 0x112233, "leader", isPublic: true);
        var token = await LoginAsync("m1@test.com");
        var lsId = await LinkshellIdAsync("Asura", "MyShell");

        var put = Authed(HttpMethod.Put, $"/api/linkshells/{lsId}/profile", token, new
        {
            description = "<p>Welcome!</p>",
            recruitmentStatus = "Open",
            recruitmentRules = "<p>Be cool.</p>",
            externalLinks = new[] { new { label = "Discord", url = "https://discord.gg/abc" } }
        });
        var putResp = await _client.SendAsync(put);
        Assert.True(putResp.IsSuccessStatusCode, await putResp.Content.ReadAsStringAsync());

        var get = Authed(HttpMethod.Get, "/api/linkshells/Asura/MyShell", token);
        var profile = await (await _client.SendAsync(get)).Content.ReadFromJsonAsync<LinkshellProfileResponse>();
        Assert.NotNull(profile);
        Assert.True(profile!.CanManage);
        Assert.Equal("Open", profile.RecruitmentStatus);
        Assert.NotNull(profile.Profile);
        Assert.Equal("<p>Welcome!</p>", profile.Profile!.Description);
        Assert.Single(profile.Profile.ExternalLinks);
        Assert.Equal("Discord", profile.Profile.ExternalLinks[0].Label);
    }

    [Fact]
    public async Task PutProfile_AsPlainMember_Forbidden()
    {
        await SeedMemberAsync("m2lead@test.com", "m2lead", "Lead2", "Asura", 9101, "MemShell", 1, "leader", isPublic: true);
        await SeedMemberAsync("m2@test.com", "m2", "Grunt", "Asura", 9101, "MemShell", 1, "member", isPublic: true);
        var token = await LoginAsync("m2@test.com");
        var lsId = await LinkshellIdAsync("Asura", "MemShell");

        var put = Authed(HttpMethod.Put, $"/api/linkshells/{lsId}/profile", token, new { recruitmentStatus = "Open" });
        var resp = await _client.SendAsync(put);
        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    [Fact]
    public async Task PutProfile_AsSackholder_Allowed()
    {
        await SeedMemberAsync("m3lead@test.com", "m3lead", "Lead3", "Asura", 9201, "SackShell", 1, "leader", isPublic: true);
        await SeedMemberAsync("m3@test.com", "m3", "Sack", "Asura", 9201, "SackShell", 1, "sackholder", isPublic: true);
        var token = await LoginAsync("m3@test.com");
        var lsId = await LinkshellIdAsync("Asura", "SackShell");

        var put = Authed(HttpMethod.Put, $"/api/linkshells/{lsId}/profile", token, new { recruitmentStatus = "Closed" });
        var resp = await _client.SendAsync(put);
        Assert.True(resp.IsSuccessStatusCode, await resp.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task PutProfile_RejectsTooManyLinks()
    {
        await SeedMemberAsync("m4@test.com", "m4", "Boss4", "Asura", 9301, "LinkShell", 1, "leader", isPublic: true);
        var token = await LoginAsync("m4@test.com");
        var lsId = await LinkshellIdAsync("Asura", "LinkShell");

        var links = Enumerable.Range(0, 6).Select(i => new { label = $"L{i}", url = "https://x.com" }).ToArray();
        var put = Authed(HttpMethod.Put, $"/api/linkshells/{lsId}/profile", token, new { recruitmentStatus = "Open", externalLinks = links });
        var resp = await _client.SendAsync(put);
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task PutProfile_RejectsNonHttpLink()
    {
        await SeedMemberAsync("m5@test.com", "m5", "Boss5", "Asura", 9401, "SchemeShell", 1, "leader", isPublic: true);
        var token = await LoginAsync("m5@test.com");
        var lsId = await LinkshellIdAsync("Asura", "SchemeShell");

        var put = Authed(HttpMethod.Put, $"/api/linkshells/{lsId}/profile", token,
            new { recruitmentStatus = "Open", externalLinks = new[] { new { label = "Bad", url = "javascript:alert(1)" } } });
        var resp = await _client.SendAsync(put);
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task PutProfile_FormerLeader_Forbidden()
    {
        await SeedMemberAsync("m6@test.com", "m6", "ExLead", "Asura", 9501, "OldLead", 1, "leader", isPublic: true);
        // Keep a second current member so the LS still resolves (MemberCount > 0).
        await SeedMemberAsync("m6b@test.com", "m6b", "Stayer", "Asura", 9501, "OldLead", 1, "member", isPublic: true);
        var lsId = await LinkshellIdAsync("Asura", "OldLead");

        // Re-sync ExLead with a different LS -> OldLead membership flips IsCurrent=false.
        var token = await LoginAsync("m6@test.com");
        var keyReq = Authed(HttpMethod.Post, "/api/keys/generate", token);
        var apiKey = (await (await _client.SendAsync(keyReq)).Content.ReadFromJsonAsync<ApiKeyResponse>())!;
        var syncReq = new HttpRequestMessage(HttpMethod.Post, "/api/sync");
        syncReq.Headers.Add("X-Api-Key", apiKey.ApiKey);
        syncReq.Content = JsonContent.Create(new SyncRequest
        {
            CharacterName = "ExLead", Server = "Asura", ActiveJob = "WAR", ActiveJobLevel = 99,
            Linkshells = [new SyncLinkshellEntry { LinkshellId = 9502, Name = "ElseWhere", ColorRgb = 1, Rank = "leader" }]
        });
        Assert.True((await _client.SendAsync(syncReq)).IsSuccessStatusCode);

        var put = Authed(HttpMethod.Put, $"/api/linkshells/{lsId}/profile", token, new { recruitmentStatus = "Open" });
        var resp = await _client.SendAsync(put);
        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    [Fact]
    public async Task UploadLogo_AsLeader_SetsLogoUrl_ThenDeleteClears()
    {
        await SeedMemberAsync("lg1@test.com", "lg1", "LogoBoss", "Asura", 9601, "LogoShell", 1, "leader", isPublic: true);
        var token = await LoginAsync("lg1@test.com");
        var lsId = await LinkshellIdAsync("Asura", "LogoShell");

        // 1x1 PNG.
        var png = Convert.FromBase64String(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
        var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(png);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(fileContent, "file", "logo.png");

        var upload = new HttpRequestMessage(HttpMethod.Post, $"/api/linkshells/{lsId}/logo") { Content = form };
        upload.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var uploadResp = await _client.SendAsync(upload);
        Assert.True(uploadResp.IsSuccessStatusCode, await uploadResp.Content.ReadAsStringAsync());

        var get1 = Authed(HttpMethod.Get, "/api/linkshells/Asura/LogoShell", token);
        var p1 = await (await _client.SendAsync(get1)).Content.ReadFromJsonAsync<LinkshellProfileResponse>();
        Assert.False(string.IsNullOrEmpty(p1!.Profile?.LogoUrl));

        var del = Authed(HttpMethod.Delete, $"/api/linkshells/{lsId}/logo", token);
        Assert.True((await _client.SendAsync(del)).IsSuccessStatusCode);

        var get2 = Authed(HttpMethod.Get, "/api/linkshells/Asura/LogoShell", token);
        var p2 = await (await _client.SendAsync(get2)).Content.ReadFromJsonAsync<LinkshellProfileResponse>();
        Assert.True(string.IsNullOrEmpty(p2!.Profile?.LogoUrl));
    }

    [Fact]
    public async Task UploadLogo_AsMember_Forbidden()
    {
        await SeedMemberAsync("lg2lead@test.com", "lg2lead", "LLead", "Asura", 9701, "LogoMem", 1, "leader", isPublic: true);
        await SeedMemberAsync("lg2@test.com", "lg2", "LMem", "Asura", 9701, "LogoMem", 1, "member", isPublic: true);
        var token = await LoginAsync("lg2@test.com");
        var lsId = await LinkshellIdAsync("Asura", "LogoMem");

        var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(new byte[] { 1, 2, 3 });
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(fileContent, "file", "logo.png");
        var upload = new HttpRequestMessage(HttpMethod.Post, $"/api/linkshells/{lsId}/logo") { Content = form };
        upload.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        Assert.Equal(HttpStatusCode.Forbidden, (await _client.SendAsync(upload)).StatusCode);
    }

    [Fact]
    public async Task GetDirectory_IncludesRecruitmentStatus_UnknownThenOpen()
    {
        await SeedMemberAsync("rs1@test.com", "rs1", "RecBoss", "Asura", 9801, "RecShell", 1, "leader", isPublic: true);

        // No profile yet -> Unknown.
        var before = await _client.GetFromJsonAsync<List<LinkshellListItem>>("/api/linkshells?server=Asura");
        var item1 = Assert.Single(before!, x => x.Name == "RecShell");
        Assert.Equal("Unknown", item1.RecruitmentStatus);

        // Officer sets Open via the Phase 3 PUT.
        var token = await LoginAsync("rs1@test.com");
        var lsId = await LinkshellIdAsync("Asura", "RecShell");
        var put = Authed(HttpMethod.Put, $"/api/linkshells/{lsId}/profile", token, new { recruitmentStatus = "Open" });
        Assert.True((await _client.SendAsync(put)).IsSuccessStatusCode);

        var after = await _client.GetFromJsonAsync<List<LinkshellListItem>>("/api/linkshells?server=Asura");
        var item2 = Assert.Single(after!, x => x.Name == "RecShell");
        Assert.Equal("Open", item2.RecruitmentStatus);
    }
}
