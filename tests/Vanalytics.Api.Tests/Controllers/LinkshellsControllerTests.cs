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
using Vanalytics.Core.DTOs.Keys;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class LinkshellsControllerTests : IAsyncLifetime
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

    private async Task<string> CreateUserAndGetTokenAsync(string email, string username, string password = "Password123!")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        db.Users.Add(new Soverance.Auth.Models.User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Username = username,
            PasswordHash = Soverance.Auth.Services.PasswordHasher.HashPassword(password),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();

        var response = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest { Email = email, Password = password });
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>();
        return auth!.AccessToken;
    }

    // Creates a user + a character that is a CURRENT member of the linkshell at the
    // given rank ("leader" | "sackholder" | "member"). The linkshell is created
    // private (IsPublic defaults false). Returns the owner's JWT.
    private async Task<string> SyncLeaderLinkshellAsync(
        string email, string username, string charName, string server,
        string lsName, long gameLsId, string rank = "leader")
    {
        var accessToken = await CreateUserAndGetTokenAsync(email, username);

        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        var keyResp = await _client.SendAsync(keyReq);
        var apiKey = (await keyResp.Content.ReadFromJsonAsync<ApiKeyResponse>())!;

        var syncReq = new HttpRequestMessage(HttpMethod.Post, "/api/sync");
        syncReq.Headers.Add("X-Api-Key", apiKey.ApiKey);
        syncReq.Content = JsonContent.Create(new SyncRequest
        {
            CharacterName = charName,
            Server = server,
            ActiveJob = "WAR",
            ActiveJobLevel = 75,
            Jobs = [new SyncJobEntry { Job = "WAR", Level = 75 }],
            Linkshells =
            [
                new SyncLinkshellEntry { LinkshellId = gameLsId, Name = lsName, ColorRgb = 0xFF0000, Rank = rank, Slot = 1 }
            ]
        });
        await _client.SendAsync(syncReq);

        return accessToken;
    }

    private async Task<Guid> GetLinkshellIdAsync(string server, long gameLsId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        return await db.Linkshells
            .Where(l => l.Server == server && l.GameLinkshellId == gameLsId)
            .Select(l => l.Id)
            .FirstAsync();
    }

    private async Task MakeLinkshellPublicAsync(string server, long gameLsId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var ls = await db.Linkshells.FirstAsync(l => l.Server == server && l.GameLinkshellId == gameLsId);
        ls.IsPublic = true;
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task GetDirectory_PrivateLinkshell_IsExcluded()
    {
        await SyncLeaderLinkshellAsync("ls_dir1@test.com", "lsdir1", "Leada", "Asura", "SecretLS", 111L);

        var resp = await _client.GetAsync("/api/linkshells?server=Asura");
        resp.EnsureSuccessStatusCode();
        var items = (await resp.Content.ReadFromJsonAsync<List<LinkshellListItem>>())!;

        Assert.DoesNotContain(items, i => i.Name == "SecretLS");
    }

    [Fact]
    public async Task GetProfile_PrivateLinkshell_AnonymousGets404()
    {
        await SyncLeaderLinkshellAsync("ls_g1@test.com", "lsg1", "Leada", "Asura", "HiddenLS", 201L);

        var resp = await _client.GetAsync("/api/linkshells/Asura/HiddenLS");

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task GetProfile_PrivateLinkshell_NonMemberGets404()
    {
        await SyncLeaderLinkshellAsync("ls_g2@test.com", "lsg2", "Leada", "Asura", "HiddenLS2", 202L);
        var outsiderToken = await CreateUserAndGetTokenAsync("ls_g2b@test.com", "lsg2b");

        var req = new HttpRequestMessage(HttpMethod.Get, "/api/linkshells/Asura/HiddenLS2");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", outsiderToken);
        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task GetProfile_PrivateLinkshell_CurrentMemberGets200AndIsPublicFalse()
    {
        var ownerToken = await SyncLeaderLinkshellAsync("ls_g3@test.com", "lsg3", "Leada", "Asura", "HiddenLS3", 203L);

        var req = new HttpRequestMessage(HttpMethod.Get, "/api/linkshells/Asura/HiddenLS3");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ownerToken);
        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = (await resp.Content.ReadFromJsonAsync<LinkshellProfileResponse>())!;
        Assert.False(body.IsPublic);
        Assert.True(body.CanManage);
    }

    [Fact]
    public async Task GetProfile_PublicLinkshell_AnonymousGets200()
    {
        await SyncLeaderLinkshellAsync("ls_g4@test.com", "lsg4", "Leada", "Asura", "OpenLS4", 204L);
        await MakeLinkshellPublicAsync("Asura", 204L);

        var resp = await _client.GetAsync("/api/linkshells/Asura/OpenLS4");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = (await resp.Content.ReadFromJsonAsync<LinkshellProfileResponse>())!;
        Assert.True(body.IsPublic);
    }

    private HttpRequestMessage BuildUpdateProfileRequest(Guid lsId, string token, bool isPublic)
    {
        var req = new HttpRequestMessage(HttpMethod.Put, $"/api/linkshells/{lsId}/profile");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        req.Content = JsonContent.Create(new UpdateLinkshellProfileRequest
        {
            Description = null,
            RecruitmentStatus = "Unknown",
            RecruitmentRules = null,
            ExternalLinks = [],
            IsPublic = isPublic,
        });
        return req;
    }

    [Fact]
    public async Task Toggle_ManagerMakesPublic_AppearsInDirectoryAndLoadsAnonymously()
    {
        var ownerToken = await SyncLeaderLinkshellAsync("ls_t1@test.com", "lst1", "Leada", "Asura", "ToggleLS", 301L);
        var lsId = await GetLinkshellIdAsync("Asura", 301L);

        var putResp = await _client.SendAsync(BuildUpdateProfileRequest(lsId, ownerToken, isPublic: true));
        Assert.Equal(HttpStatusCode.OK, putResp.StatusCode);

        var dir = (await (await _client.GetAsync("/api/linkshells?server=Asura")).Content
            .ReadFromJsonAsync<List<LinkshellListItem>>())!;
        Assert.Contains(dir, i => i.Name == "ToggleLS");

        var anon = await _client.GetAsync("/api/linkshells/Asura/ToggleLS");
        Assert.Equal(HttpStatusCode.OK, anon.StatusCode);
    }

    [Fact]
    public async Task Toggle_ManagerMakesPrivateAgain_DisappearsFromDirectory()
    {
        var ownerToken = await SyncLeaderLinkshellAsync("ls_t2@test.com", "lst2", "Leada", "Asura", "ToggleLS2", 302L);
        var lsId = await GetLinkshellIdAsync("Asura", 302L);

        await _client.SendAsync(BuildUpdateProfileRequest(lsId, ownerToken, isPublic: true));
        await _client.SendAsync(BuildUpdateProfileRequest(lsId, ownerToken, isPublic: false));

        var dir = (await (await _client.GetAsync("/api/linkshells?server=Asura")).Content
            .ReadFromJsonAsync<List<LinkshellListItem>>())!;
        Assert.DoesNotContain(dir, i => i.Name == "ToggleLS2");
    }

    [Fact]
    public async Task Toggle_NonManager_IsForbidden()
    {
        await SyncLeaderLinkshellAsync("ls_t3@test.com", "lst3", "Leada", "Asura", "ToggleLS3", 303L);
        var lsId = await GetLinkshellIdAsync("Asura", 303L);
        var outsiderToken = await CreateUserAndGetTokenAsync("ls_t3b@test.com", "lst3b");

        var resp = await _client.SendAsync(BuildUpdateProfileRequest(lsId, outsiderToken, isPublic: true));

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }
}
