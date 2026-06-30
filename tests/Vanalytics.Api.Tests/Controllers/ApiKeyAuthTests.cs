using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Soverance.Auth.DTOs;
using Soverance.Auth.Services;
using Vanalytics.Core.DTOs.Keys;
using Vanalytics.Core.DTOs.Sync;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class ApiKeyAuthTests : IAsyncLifetime
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

    private async Task<(string Token, string ApiKey, Guid CharacterId)> SetupUserWithCharacterAsync(
        string email, string username, string charName)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var user = new Soverance.Auth.Models.User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Username = username,
            PasswordHash = PasswordHasher.HashPassword("Password123!"),
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var loginResp = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest
        { Email = email, Password = "Password123!" });
        var auth = (await loginResp.Content.ReadFromJsonAsync<AuthResponse>())!;

        var keyReq = new HttpRequestMessage(HttpMethod.Post, "/api/keys/generate");
        keyReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        var keyResp = await _client.SendAsync(keyReq);
        var apiKey = (await keyResp.Content.ReadFromJsonAsync<ApiKeyResponse>())!;

        var syncReq = new HttpRequestMessage(HttpMethod.Post, "/api/sync");
        syncReq.Headers.Add("X-Api-Key", apiKey.ApiKey);
        syncReq.Content = JsonContent.Create(new SyncRequest
        {
            CharacterName = charName,
            Server = "Asura",
            ActiveJob = "WAR",
            ActiveJobLevel = 75,
            Jobs = [new SyncJobEntry { Job = "WAR", Level = 75 }]
        });
        await _client.SendAsync(syncReq);

        var character = await db.Characters.FirstAsync(c => c.Name == charName);
        return (auth.AccessToken, apiKey.ApiKey, character.Id);
    }

    [Fact]
    public async Task Generated_key_authenticates_and_sets_lookup()
    {
        var (token, _, _) = await SetupUserWithCharacterAsync("ak1@test.com", "ak1", "Akone");
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var gen = await _client.PostAsync("/api/keys/generate", null);
        Assert.Equal(HttpStatusCode.OK, gen.StatusCode);
        var key = (await gen.Content.ReadFromJsonAsync<ApiKeyResponse>())!.ApiKey;

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var u = await db.Set<Soverance.Auth.Models.User>().FirstAsync(u => u.Email == "ak1@test.com");
            Assert.Equal(ApiKeyHasher.Lookup(key), u.ApiKeyLookup);
        }

        var req = new HttpRequestMessage(HttpMethod.Get, "/api/sync/blueprint?job=THF");
        req.Headers.Add("X-Api-Key", key);
        req.Headers.Add("X-Character-Name", "Akone");
        req.Headers.Add("X-Server", "Asura"); // matches SetupUserWithCharacterAsync's Server = "Asura"
        var resp = await _client.SendAsync(req);
        Assert.NotEqual(HttpStatusCode.Unauthorized, resp.StatusCode); // auth passed
    }

    [Fact]
    public async Task Legacy_bcrypt_only_key_authenticates_and_backfills()
    {
        await SetupUserWithCharacterAsync("ak2@test.com", "ak2", "Aktwo");
        const string rawKey = "legacy-raw-key-value";
        Guid userId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var u = await db.Set<Soverance.Auth.Models.User>().FirstAsync(u => u.Email == "ak2@test.com");
            u.ApiKey = PasswordHasher.HashPassword(rawKey);
            u.ApiKeyLookup = null;
            await db.SaveChangesAsync();
            userId = u.Id;
        }

        var req = new HttpRequestMessage(HttpMethod.Get, "/api/sync/blueprint?job=THF");
        req.Headers.Add("X-Api-Key", rawKey);
        req.Headers.Add("X-Character-Name", "Aktwo");
        req.Headers.Add("X-Server", "Asura"); // matches SetupUserWithCharacterAsync's Server = "Asura"
        var resp = await _client.SendAsync(req);
        Assert.NotEqual(HttpStatusCode.Unauthorized, resp.StatusCode);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var u = await db.Set<Soverance.Auth.Models.User>().FirstAsync(u => u.Id == userId);
            Assert.Equal(ApiKeyHasher.Lookup(rawKey), u.ApiKeyLookup); // self-healed
        }
    }
}
