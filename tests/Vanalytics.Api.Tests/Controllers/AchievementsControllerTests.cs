using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Soverance.Auth.DTOs;
using Soverance.Auth.Models;
using Soverance.Auth.Services;
using Vanalytics.Core.Data;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class AchievementsControllerTests : IAsyncLifetime
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
                    var descriptor = services.SingleOrDefault(
                        d => d.ServiceType == typeof(DbContextOptions<VanalyticsDbContext>));
                    if (descriptor != null) services.Remove(descriptor);

                    services.AddDbContext<VanalyticsDbContext>(options =>
                        options.UseSqlServer(_container.GetConnectionString()));
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

    // ── Helpers ──────────────────────────────────────────────────────────────

    private async Task<User> SeedUserAsync(
        string email, string username, UserRole role = UserRole.Member,
        string password = "Password123!")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Username = username,
            PasswordHash = PasswordHasher.HashPassword(password),
            Role = role,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private async Task<string> LoginTokenAsync(string email, string password = "Password123!")
    {
        var resp = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest
        {
            Email = email,
            Password = password
        });
        resp.EnsureSuccessStatusCode();
        var auth = (await resp.Content.ReadFromJsonAsync<AuthResponse>())!;
        return auth.AccessToken;
    }

    private async Task<string> AdminTokenAsync()
    {
        await SeedUserAsync("admin@ach-test.com", "achadminuser", UserRole.Admin);
        return await LoginTokenAsync("admin@ach-test.com");
    }

    private async Task SeedCharactersAsync(int count)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var user = Vanalytics.Api.Tests.Achievements.TestData.AddUser(db);
        await db.SaveChangesAsync();

        for (int i = 0; i < count; i++)
        {
            Vanalytics.Api.Tests.Achievements.TestData.AddCharacter(
                db, user.Id, $"RescoreChar{i}", "Asura", isPublic: true);
        }
        await db.SaveChangesAsync();
    }

    // ── Assertion 1: GET /api/achievements/rubric (no auth) → 200, version, 14 categories ──

    [Fact]
    public async Task GetRubric_NoAuth_Returns200WithVersionAndCategories()
    {
        var resp = await _client.GetAsync("/api/achievements/rubric");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var doc = System.Text.Json.JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        var root = doc.RootElement;

        Assert.Equal(AchievementRubric.Version, root.GetProperty("version").GetInt32());

        var categories = root.GetProperty("categories");
        Assert.Equal(14, categories.GetArrayLength());
    }

    // ── Assertion 2: POST /api/admin/achievements/rescore WITHOUT admin token → 401 ──

    [Fact]
    public async Task Rescore_WithoutToken_Returns401()
    {
        // No Authorization header at all
        var resp = await _client.PostAsync("/api/admin/achievements/rescore", null);

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    // Poll rescore-status until the run reports not-running (or timeout), returning the final status json.
    private async Task<System.Text.Json.JsonElement> WaitForRescoreAsync(string token, int timeoutSeconds = 60)
    {
        var deadline = DateTimeOffset.UtcNow.AddSeconds(timeoutSeconds);
        while (true)
        {
            var req = new HttpRequestMessage(HttpMethod.Get, "/api/admin/achievements/rescore-status");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var resp = await _client.SendAsync(req);
            resp.EnsureSuccessStatusCode();
            var doc = System.Text.Json.JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var root = doc.RootElement.Clone();
            var running = root.GetProperty("isRunning").GetBoolean();
            var started = root.GetProperty("startedAt").ValueKind != System.Text.Json.JsonValueKind.Null;
            if (!running && started) return root;
            if (DateTimeOffset.UtcNow > deadline) return root;
            await Task.Delay(250);
        }
    }

    // ── Assertion 3: POST with admin token, N characters seeded → 202, background run completes, rows written ──

    [Fact]
    public async Task Rescore_WithAdminToken_Returns202AndCompletesInBackground()
    {
        const int n = 3;
        await SeedCharactersAsync(n);
        var token = await AdminTokenAsync();

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/admin/achievements/rescore");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.Accepted, resp.StatusCode);

        var final = await WaitForRescoreAsync(token);
        Assert.False(final.GetProperty("isRunning").GetBoolean());
        Assert.Equal(n, final.GetProperty("total").GetInt32());
        Assert.Equal(n, final.GetProperty("processed").GetInt32());
        Assert.Equal(0, final.GetProperty("failed").GetInt32());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var charIds = await db.Characters.Select(c => c.Id).ToListAsync();
        Assert.Equal(n, charIds.Count);
        foreach (var id in charIds)
            Assert.NotNull(await db.CharacterAchievements.FindAsync(id));
    }

    // ── Assertion 3b: GET rescore-status WITHOUT admin token → 401 ──

    [Fact]
    public async Task RescoreStatus_WithoutToken_Returns401()
    {
        var resp = await _client.GetAsync("/api/admin/achievements/rescore-status");
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    // ── Assertion 3c: rescore-status before any run → idle (not running, total 0) ──

    [Fact]
    public async Task RescoreStatus_BeforeAnyRun_ReportsIdle()
    {
        var token = await AdminTokenAsync();
        var req = new HttpRequestMessage(HttpMethod.Get, "/api/admin/achievements/rescore-status");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var doc = System.Text.Json.JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("isRunning").GetBoolean());
        Assert.Equal(0, doc.RootElement.GetProperty("total").GetInt32());
    }

    // ── Assertion 4: GET /api/admin/achievements/status WITHOUT admin token → 401 ──

    [Fact]
    public async Task Status_WithoutToken_Returns401()
    {
        var resp = await _client.GetAsync("/api/admin/achievements/status");

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    // ── Assertion 5: status before any rescore → all N characters need a rescore ──

    [Fact]
    public async Task Status_BeforeRescore_ReportsAllNeedRescore()
    {
        const int n = 2;
        await SeedCharactersAsync(n);
        var token = await AdminTokenAsync();

        var req = new HttpRequestMessage(HttpMethod.Get, "/api/admin/achievements/status");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        using var doc = System.Text.Json.JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        var root = doc.RootElement;

        Assert.Equal(AchievementRubric.Version, root.GetProperty("currentRubricVersion").GetInt32());
        Assert.Equal(n, root.GetProperty("totalCharacters").GetInt32());
        Assert.Equal(0, root.GetProperty("scoredAtCurrentVersion").GetInt32());
        Assert.Equal(n, root.GetProperty("needsRescore").GetInt32());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, root.GetProperty("lastComputedAt").ValueKind);
    }

    // ── Assertion 6: status after a rescore → nothing needs a rescore, timestamps set ──

    [Fact]
    public async Task Status_AfterRescore_ReportsAllScored()
    {
        const int n = 3;
        await SeedCharactersAsync(n);
        var token = await AdminTokenAsync();

        var rescore = new HttpRequestMessage(HttpMethod.Post, "/api/admin/achievements/rescore");
        rescore.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        (await _client.SendAsync(rescore)).EnsureSuccessStatusCode();
        await WaitForRescoreAsync(token); // rescore now runs as a background job — wait for it to finish

        var req = new HttpRequestMessage(HttpMethod.Get, "/api/admin/achievements/status");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        using var doc = System.Text.Json.JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        var root = doc.RootElement;

        Assert.Equal(n, root.GetProperty("totalCharacters").GetInt32());
        Assert.Equal(n, root.GetProperty("scoredAtCurrentVersion").GetInt32());
        Assert.Equal(0, root.GetProperty("needsRescore").GetInt32());
        Assert.NotEqual(System.Text.Json.JsonValueKind.Null, root.GetProperty("lastComputedAt").ValueKind);
        Assert.NotEqual(System.Text.Json.JsonValueKind.Null, root.GetProperty("oldestComputedAt").ValueKind);
    }
}
