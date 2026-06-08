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
        await _client.SendAsync(syncReq);

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
}
