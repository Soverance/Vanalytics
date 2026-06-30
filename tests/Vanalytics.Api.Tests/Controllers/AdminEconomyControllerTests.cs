using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Testcontainers.MsSql;
using Soverance.Auth.DTOs;
using Soverance.Auth.Models;
using Soverance.Auth.Services;
using Vanalytics.Api.Services.SearchServer;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Api.Tests.Controllers;

/// <summary>
/// A prober that never completes (until cancelled), keeping the discovery job alive
/// indefinitely so the 409 "already running" check is deterministic on all platforms.
/// </summary>
file sealed class HangingProber : IDiscoveryProber
{
    public async Task<bool> IsSearchServerAsync(
        string host, int port, int probeItemId, int timeoutMs, CancellationToken ct)
    {
        await Task.Delay(Timeout.Infinite, ct).ConfigureAwait(false);
        return false;
    }
}

public class AdminEconomyControllerTests : IAsyncLifetime
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

                    // Remove hosted services to prevent interference with test data
                    services.RemoveAll<IHostedService>();
                });
                builder.ConfigureAppConfiguration((_, config) =>
                {
                    config.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Jwt:Secret"] = "TestSecretKeyThatIsAtLeast32BytesLongForHmacSha256!!",
                        ["Jwt:Issuer"] = "VanalyticsTest",
                        ["Jwt:Audience"] = "VanalyticsTest",
                        ["Jwt:AccessTokenExpirationMinutes"] = "15",
                        ["Jwt:RefreshTokenExpirationDays"] = "7",
                        ["SKIP_ITEM_SEED"] = "true",
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

    private async Task<User> SeedUserAsync(
        string email, string username, UserRole role = UserRole.Member,
        string? password = "Password123!")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Username = username,
            PasswordHash = password is null ? null : PasswordHasher.HashPassword(password),
            Role = role,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private async Task<AuthResponse> LoginAsync(string email, string password)
    {
        var response = await _client.PostAsJsonAsync("/api/auth/login", new LoginRequest
        {
            Email = email,
            Password = password
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
    }

    private async Task<string> AdminTokenAsync()
    {
        await SeedUserAsync("admin@example.com", "adminuser", UserRole.Admin);
        var auth = await LoginAsync("admin@example.com", "Password123!");
        return auth.AccessToken;
    }

    private async Task<string> MemberTokenAsync()
    {
        await SeedUserAsync("member@example.com", "memberuser", UserRole.Member);
        var auth = await LoginAsync("member@example.com", "Password123!");
        return auth.AccessToken;
    }

    // ── GET worlds ────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetWorlds_RequiresAdmin_403ForNonAdmin()
    {
        var memberToken = await MemberTokenAsync();

        var req = new HttpRequestMessage(HttpMethod.Get, "/api/admin/economy/worlds");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", memberToken);
        var response = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task GetWorlds_AsAdmin_ReturnsOk()
    {
        var token = await AdminTokenAsync();

        var req = new HttpRequestMessage(HttpMethod.Get, "/api/admin/economy/worlds");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var response = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    // ── PUT master ────────────────────────────────────────────────────────────

    [Fact]
    public async Task PutMaster_TogglesScraperSetting()
    {
        var token = await AdminTokenAsync();

        // No pre-seed needed: the controller upserts row Id=1 if absent.
        // PUT master → enabled:true
        var putReq = new HttpRequestMessage(HttpMethod.Put, "/api/admin/economy/master");
        putReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        putReq.Content = JsonContent.Create(new { enabled = true });
        var putResp = await _client.SendAsync(putReq);
        Assert.Equal(HttpStatusCode.OK, putResp.StatusCode);

        // GET master → masterEnabled == true
        var getReq = new HttpRequestMessage(HttpMethod.Get, "/api/admin/economy/master");
        getReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var getResp = await _client.SendAsync(getReq);
        Assert.Equal(HttpStatusCode.OK, getResp.StatusCode);

        var body = await getResp.Content.ReadFromJsonAsync<MasterResponse>();
        Assert.True(body!.MasterEnabled);
    }

    // ── PUT {serverId}/endpoint ───────────────────────────────────────────────

    [Fact]
    public async Task PutEndpoint_SetsHostPort_AndManualMapping()
    {
        var token = await AdminTokenAsync();

        // Seed a GameServer
        int serverId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var gs = new GameServer
            {
                Name = "Asura",
                Status = ServerStatus.Online,
                LastCheckedAt = DateTimeOffset.UtcNow,
                CreatedAt = DateTimeOffset.UtcNow,
                MappingSource = MappingSource.Unmapped,
            };
            db.GameServers.Add(gs);
            await db.SaveChangesAsync();
            serverId = gs.Id;
        }

        // PUT endpoint
        var putReq = new HttpRequestMessage(HttpMethod.Put, $"/api/admin/economy/{serverId}/endpoint");
        putReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        putReq.Content = JsonContent.Create(new { host = "1.2.3.4", port = 54002 });
        var putResp = await _client.SendAsync(putReq);
        Assert.Equal(HttpStatusCode.OK, putResp.StatusCode);

        // Verify DB state
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var gs = await db.GameServers.FindAsync(serverId);
            Assert.NotNull(gs);
            Assert.Equal("1.2.3.4", gs!.SearchHost);
            Assert.Equal(54002, gs.SearchPort);
            Assert.Equal(MappingSource.Manual, gs.MappingSource);
        }
    }

    // ── POST {serverId}/test ──────────────────────────────────────────────────

    [Fact]
    public async Task PostTest_ReturnsHealthyFalse_WhenNothingListening()
    {
        var token = await AdminTokenAsync();

        // Seed a GameServer pointing at 127.0.0.1:1 — deterministically unreachable
        int serverId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var gs = new GameServer
            {
                Name = "Bahamut",
                Status = ServerStatus.Online,
                LastCheckedAt = DateTimeOffset.UtcNow,
                CreatedAt = DateTimeOffset.UtcNow,
                SearchHost = "127.0.0.1",
                SearchPort = 1, // nothing listening here
            };
            db.GameServers.Add(gs);
            await db.SaveChangesAsync();
            serverId = gs.Id;
        }

        var req = new HttpRequestMessage(HttpMethod.Post, $"/api/admin/economy/{serverId}/test");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<HealthyResponse>();
        Assert.NotNull(body);
        Assert.False(body!.Healthy);

        // 1. Verify DB state was persisted: EndpointHealthy==false and LastProbedAt set
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var gs = await db.GameServers.FindAsync(serverId);
            Assert.NotNull(gs);
            Assert.False(gs!.EndpointHealthy);
            Assert.NotNull(gs.LastProbedAt);
        }
    }

    // ── PUT {serverId}/scrape-enabled ─────────────────────────────────────────

    [Fact]
    public async Task PutScrapeEnabled_RefusesWhenNoEndpoint()
    {
        var token = await AdminTokenAsync();

        // Seed a GameServer with no SearchHost
        int serverId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var gs = new GameServer
            {
                Name = "Carbuncle",
                Status = ServerStatus.Online,
                LastCheckedAt = DateTimeOffset.UtcNow,
                CreatedAt = DateTimeOffset.UtcNow,
                SearchHost = null, // no endpoint
            };
            db.GameServers.Add(gs);
            await db.SaveChangesAsync();
            serverId = gs.Id;
        }

        // Try enabling scrape — should 400
        var putReq = new HttpRequestMessage(HttpMethod.Put, $"/api/admin/economy/{serverId}/scrape-enabled");
        putReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        putReq.Content = JsonContent.Create(new { enabled = true });
        var putResp = await _client.SendAsync(putReq);

        Assert.Equal(HttpStatusCode.BadRequest, putResp.StatusCode);
    }

    [Fact]
    public async Task PutScrapeEnabled_AllowsDisableWhenNoEndpoint()
    {
        var token = await AdminTokenAsync();

        // Seed a GameServer with no SearchHost but ScrapeEnabled=true (shouldn't happen in practice but test disabling)
        int serverId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var gs = new GameServer
            {
                Name = "Fenrir",
                Status = ServerStatus.Online,
                LastCheckedAt = DateTimeOffset.UtcNow,
                CreatedAt = DateTimeOffset.UtcNow,
                SearchHost = null,
                ScrapeEnabled = true,
            };
            db.GameServers.Add(gs);
            await db.SaveChangesAsync();
            serverId = gs.Id;
        }

        // Disabling should succeed even with no endpoint
        var putReq = new HttpRequestMessage(HttpMethod.Put, $"/api/admin/economy/{serverId}/scrape-enabled");
        putReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        putReq.Content = JsonContent.Create(new { enabled = false });
        var putResp = await _client.SendAsync(putReq);

        Assert.Equal(HttpStatusCode.OK, putResp.StatusCode);

        // 2. Verify DB state was persisted: ScrapeEnabled==false
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var gs = await db.GameServers.FindAsync(serverId);
            Assert.NotNull(gs);
            Assert.False(gs!.ScrapeEnabled);
        }
    }

    // ── 404 on unknown server ─────────────────────────────────────────────────

    // 3. 404 on PUT endpoint for bogus server id
    [Fact]
    public async Task PutEndpoint_Returns404_ForUnknownServer()
    {
        var token = await AdminTokenAsync();

        var putReq = new HttpRequestMessage(HttpMethod.Put, "/api/admin/economy/999999/endpoint");
        putReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        putReq.Content = JsonContent.Create(new { host = "1.2.3.4", port = 54002 });
        var putResp = await _client.SendAsync(putReq);

        Assert.Equal(HttpStatusCode.NotFound, putResp.StatusCode);
    }

    [Fact]
    public async Task PostTest_Returns404_ForUnknownServer()
    {
        var token = await AdminTokenAsync();

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/admin/economy/999999/test");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var resp = await _client.SendAsync(req);

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    // ── PUT master records UpdatedByUserId ────────────────────────────────────

    // 4. PutMaster records UpdatedByUserId in ScraperSettings Id=1
    [Fact]
    public async Task PutMaster_RecordsUpdatedByUserId()
    {
        var token = await AdminTokenAsync();

        var putReq = new HttpRequestMessage(HttpMethod.Put, "/api/admin/economy/master");
        putReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        putReq.Content = JsonContent.Create(new { enabled = true });
        var putResp = await _client.SendAsync(putReq);
        Assert.Equal(HttpStatusCode.OK, putResp.StatusCode);

        // Reload ScraperSettings Id=1 and verify UpdatedByUserId was stamped
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var setting = await db.ScraperSettings.FindAsync(1);
        Assert.NotNull(setting);
        Assert.NotNull(setting!.UpdatedByUserId);
    }

    // ── Discovery endpoints ───────────────────────────────────────────────────

    /// <summary>
    /// Creates a factory with a <see cref="HangingProber"/> injected as <see cref="IDiscoveryProber"/>.
    /// The prober never completes (until cancelled), so the discovery job stays "running"
    /// indefinitely, making the 409 "already running" assertion deterministic on all platforms.
    /// </summary>
    private WebApplicationFactory<Program> DiscoveryFactory() =>
        new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    var descriptor = services.SingleOrDefault(
                        d => d.ServiceType == typeof(DbContextOptions<VanalyticsDbContext>));
                    if (descriptor != null) services.Remove(descriptor);

                    services.AddDbContext<VanalyticsDbContext>(options =>
                        options.UseSqlServer(_container.GetConnectionString()));

                    services.RemoveAll<IHostedService>();

                    // Replace the real prober with a never-completing fake so the discovery
                    // job stays alive until explicitly cancelled — no network, no flake.
                    services.RemoveAll<IDiscoveryProber>();
                    services.AddSingleton<IDiscoveryProber>(new HangingProber());
                });
                builder.ConfigureAppConfiguration((_, config) =>
                {
                    config.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Jwt:Secret"] = "TestSecretKeyThatIsAtLeast32BytesLongForHmacSha256!!",
                        ["Jwt:Issuer"] = "VanalyticsTest",
                        ["Jwt:Audience"] = "VanalyticsTest",
                        ["Jwt:AccessTokenExpirationMinutes"] = "15",
                        ["Jwt:RefreshTokenExpirationDays"] = "7",
                        ["SKIP_ITEM_SEED"] = "true",
                    });
                });
            });

    [Fact]
    public async Task DiscoveryStart_SecondCall_Returns409()
    {
        await using var factory = DiscoveryFactory();
        using var client = factory.CreateClient();

        // Seed admin and get token
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var user = new User
            {
                Id = Guid.NewGuid(),
                Email = "admin2@example.com",
                Username = "adminuser2",
                PasswordHash = PasswordHasher.HashPassword("Password123!"),
                Role = UserRole.Admin,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow,
            };
            db.Users.Add(user);
            await db.SaveChangesAsync();
        }
        var auth = await client.PostAsJsonAsync("/api/auth/login",
            new LoginRequest { Email = "admin2@example.com", Password = "Password123!" });
        auth.EnsureSuccessStatusCode();
        var token = (await auth.Content.ReadFromJsonAsync<AuthResponse>())!.AccessToken;

        // First start — should succeed (200)
        var req1 = new HttpRequestMessage(HttpMethod.Post, "/api/admin/economy/discovery/start");
        req1.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var resp1 = await client.SendAsync(req1);
        Assert.Equal(HttpStatusCode.OK, resp1.StatusCode);

        // Second start while scan is still running (127.0.0.2 won't respond within 10s) — should 409
        var req2 = new HttpRequestMessage(HttpMethod.Post, "/api/admin/economy/discovery/start");
        req2.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var resp2 = await client.SendAsync(req2);
        Assert.Equal(HttpStatusCode.Conflict, resp2.StatusCode);
    }

    [Fact]
    public async Task DiscoveryCancel_WhenNoneRunning_Returns404()
    {
        await using var factory = DiscoveryFactory();
        using var client = factory.CreateClient();

        // Seed admin and get token
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var user = new User
            {
                Id = Guid.NewGuid(),
                Email = "admin3@example.com",
                Username = "adminuser3",
                PasswordHash = PasswordHasher.HashPassword("Password123!"),
                Role = UserRole.Admin,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow,
            };
            db.Users.Add(user);
            await db.SaveChangesAsync();
        }
        var auth = await client.PostAsJsonAsync("/api/auth/login",
            new LoginRequest { Email = "admin3@example.com", Password = "Password123!" });
        auth.EnsureSuccessStatusCode();
        var token = (await auth.Content.ReadFromJsonAsync<AuthResponse>())!.AccessToken;

        // Cancel with no active job — should 404
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/admin/economy/discovery/cancel");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var resp = await client.SendAsync(req);
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    // ── DTOs ──────────────────────────────────────────────────────────────────

    private record MasterResponse(bool MasterEnabled);
    private record HealthyResponse(bool Healthy);
}
