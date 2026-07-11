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

    // ── Assertion 3: POST with admin token, N characters seeded → 200, recomputed == N, rows written ──

    [Fact]
    public async Task Rescore_WithAdminToken_RecomputesAllCharacters()
    {
        const int n = 3;
        await SeedCharactersAsync(n);

        var token = await AdminTokenAsync();

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/admin/achievements/rescore");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var doc = System.Text.Json.JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        var recomputed = doc.RootElement.GetProperty("recomputed").GetInt32();

        // RecomputeAllAsync returns count of ALL characters (our N + admin user has none → exactly N)
        Assert.Equal(n, recomputed);

        // Verify each character has a CharacterAchievement row
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var charIds = await db.Characters.Select(c => c.Id).ToListAsync();
        Assert.Equal(n, charIds.Count);
        foreach (var id in charIds)
        {
            var row = await db.CharacterAchievements.FindAsync(id);
            Assert.NotNull(row);
        }
    }
}
