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
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Api.Tests.Controllers;

public class DiscoveryReportTests : IAsyncLifetime
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

    [Fact]
    public async Task Report_RequiresAdmin_403ForMember()
    {
        var token = await MemberTokenAsync();
        var req = new HttpRequestMessage(HttpMethod.Get, "/api/admin/economy/discovery/report");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    [Fact]
    public async Task Report_ReturnsRows_WithParsedSamplesAndItemNames()
    {
        var token = await AdminTokenAsync();
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            db.GameItems.Add(new GameItem { ItemId = 4096, Name = "Fire Crystal", StackSize = 12, Flags = 0, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
            db.DiscoveredEndpoints.Add(new DiscoveredEndpoint
            {
                Ip = "203.0.113.71", Port = 54002, ScannedAt = DateTimeOffset.UtcNow,
                SampleSalesJson = "[{\"itemId\":4096,\"sales\":[{\"price\":100,\"soldAt\":\"2026-06-01T00:00:00+00:00\",\"sellerName\":\"S\",\"buyerName\":\"B\"}]}]",
            });
            await db.SaveChangesAsync();
        }

        var req = new HttpRequestMessage(HttpMethod.Get, "/api/admin/economy/discovery/report");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadAsStringAsync();
        Assert.Contains("203.0.113.71", body);
        Assert.Contains("Fire Crystal", body);   // itemName resolved from GameItems
    }

    [Fact]
    public async Task Map_SetsGameServerEndpoint_AndStampsMapping()
    {
        var token = await AdminTokenAsync();
        int endpointId, serverId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var gs = new GameServer { Name = "Siren", Status = ServerStatus.Online, LastCheckedAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow, MappingSource = MappingSource.Unmapped };
            db.GameServers.Add(gs);
            var ep = new DiscoveredEndpoint { Ip = "203.0.113.71", Port = 54002, ScannedAt = DateTimeOffset.UtcNow, SampleSalesJson = "[]" };
            db.DiscoveredEndpoints.Add(ep);
            await db.SaveChangesAsync();
            endpointId = ep.Id; serverId = gs.Id;
        }

        var req = new HttpRequestMessage(HttpMethod.Post, $"/api/admin/economy/discovery/{endpointId}/map");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        req.Content = JsonContent.Create(new { serverId });
        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var gs = await db.GameServers.FindAsync(serverId);
            Assert.Equal("203.0.113.71", gs!.SearchHost);
            Assert.Equal(54002, gs.SearchPort);
            Assert.Equal(MappingSource.Manual, gs.MappingSource);
            var ep = await db.DiscoveredEndpoints.FindAsync(endpointId);
            Assert.Equal(serverId, ep!.MappedServerId);
        }
    }

    [Fact]
    public async Task Map_NullServerId_ClearsMapping()
    {
        var token = await AdminTokenAsync();
        int endpointId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            // Seed a real GameServer so the FK constraint is satisfied when seeding MappedServerId
            var gs = new GameServer { Name = "Lakshmi", Status = ServerStatus.Online, LastCheckedAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow, MappingSource = MappingSource.Unmapped };
            db.GameServers.Add(gs);
            await db.SaveChangesAsync();
            var ep = new DiscoveredEndpoint { Ip = "1.2.3.4", Port = 54002, ScannedAt = DateTimeOffset.UtcNow, SampleSalesJson = "[]", MappedServerId = gs.Id };
            db.DiscoveredEndpoints.Add(ep);
            await db.SaveChangesAsync();
            endpointId = ep.Id;
        }

        var req = new HttpRequestMessage(HttpMethod.Post, $"/api/admin/economy/discovery/{endpointId}/map");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        req.Content = JsonContent.Create(new { serverId = (int?)null });
        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var ep = await db.DiscoveredEndpoints.FindAsync(endpointId);
            Assert.Null(ep!.MappedServerId);
        }
    }

    [Fact]
    public async Task Map_UnknownEndpoint_Returns404()
    {
        var token = await AdminTokenAsync();
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/admin/economy/discovery/999999/map");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        req.Content = JsonContent.Create(new { serverId = 1 });
        var resp = await _client.SendAsync(req);
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }
}
