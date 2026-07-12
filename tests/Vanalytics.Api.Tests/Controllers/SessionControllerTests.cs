using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
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

public class SessionControllerTests : IAsyncLifetime
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

    private async Task<string> SetupApiKeyAsync(string email, string username, string charName)
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

        return apiKey.ApiKey;
    }

    private HttpRequestMessage Post(string url, string apiKey, object body)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Headers.Add("X-Api-Key", apiKey);
        req.Content = JsonContent.Create(body);
        return req;
    }

    // The regression: before the fix a single over-length field triggered
    // ASP.NET model validation and rejected the WHOLE 500-event batch with 400,
    // silently dropping entire sessions.
    [Fact]
    public async Task Events_WithOverLengthField_AcceptsBatchAndTruncates()
    {
        var apiKey = await SetupApiKeyAsync("sess1@test.com", "sess1", "Sessone");

        var start = await _client.SendAsync(Post("/api/session/start", apiKey,
            new { characterName = "Sessone", server = "Asura", zone = "Dynamis - San d'Oria [D]" }));
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);

        var longSource = new string('X', 200); // column is 64
        var events = new[]
        {
            new { eventType = "MeleeDamage", timestamp = DateTimeOffset.UtcNow, source = "Sessone", target = "Vanguard Footsoldier", value = 123L, ability = (string?)null, itemId = (int?)null, zone = "Dynamis - San d'Oria [D]" },
            new { eventType = "MeleeDamage", timestamp = DateTimeOffset.UtcNow, source = longSource, target = "Vanguard Footsoldier", value = 456L, ability = (string?)null, itemId = (int?)null, zone = "Dynamis - San d'Oria [D]" },
            new { eventType = "MobKill", timestamp = DateTimeOffset.UtcNow, source = "Sessone", target = "Vanguard Footsoldier", value = 0L, ability = (string?)null, itemId = (int?)null, zone = "Dynamis - San d'Oria [D]" },
        };

        var resp = await _client.SendAsync(Post("/api/session/events", apiKey,
            new { characterName = "Sessone", server = "Asura", events }));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(3, json.GetProperty("accepted").GetInt32());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var stored = await db.SessionEvents.OrderByDescending(e => e.Value).ToListAsync();
        Assert.Equal(3, stored.Count);
        // The over-length source was clamped to the column width, not rejected.
        Assert.Equal(64, stored.Single(e => e.Value == 456).Source.Length);
    }

    [Fact]
    public async Task Events_SkipsUnparseableEventType_KeepsRest()
    {
        var apiKey = await SetupApiKeyAsync("sess2@test.com", "sess2", "Sesstwo");
        await _client.SendAsync(Post("/api/session/start", apiKey,
            new { characterName = "Sesstwo", server = "Asura", zone = "Bhaflau Thickets" }));

        var events = new[]
        {
            new { eventType = "NotARealType", timestamp = DateTimeOffset.UtcNow, source = "Sesstwo", target = "", value = 0L, zone = "Bhaflau Thickets" },
            new { eventType = "GilGain", timestamp = DateTimeOffset.UtcNow, source = "Sesstwo", target = "", value = 9888L, zone = "Bhaflau Thickets" },
        };

        var resp = await _client.SendAsync(Post("/api/session/events", apiKey,
            new { characterName = "Sesstwo", server = "Asura", events }));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, json.GetProperty("accepted").GetInt32());
        Assert.Equal(2, json.GetProperty("total").GetInt32());
    }

    // Recovery: import a full run from a .jsonl file whose live upload failed.
    [Fact]
    public async Task Import_CreatesCompletedSessionDatedFromEvents()
    {
        var apiKey = await SetupApiKeyAsync("sess3@test.com", "sess3", "Sessthree");

        var t0 = new DateTimeOffset(2026, 7, 7, 20, 0, 0, TimeSpan.Zero);
        var events = new[]
        {
            new { eventType = "MeleeDamage", timestamp = t0, source = "Sessthree", target = "Dahak", value = 100L, zone = "Dynamis - Xarcabard [D]" },
            new { eventType = "MobKill", timestamp = t0.AddMinutes(42), source = "Sessthree", target = "Dahak", value = 0L, zone = "Dynamis - Xarcabard [D]" },
        };

        var resp = await _client.SendAsync(Post("/api/session/import", apiKey,
            new { characterName = "Sessthree", server = "Asura", zone = "Dynamis - Xarcabard [D]", events }));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(2, json.GetProperty("accepted").GetInt32());
        var sessionId = json.GetProperty("sessionId").GetGuid();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var session = await db.Sessions.FirstAsync(s => s.Id == sessionId);
        Assert.Equal(t0, session.StartedAt);
        Assert.Equal(t0.AddMinutes(42), session.EndedAt);
        Assert.Equal(2, await db.SessionEvents.CountAsync(e => e.SessionId == sessionId));
    }
}
