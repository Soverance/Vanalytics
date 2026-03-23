using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class ServersControllerTests : IAsyncLifetime
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

    private async Task SeedServersAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var now = DateTimeOffset.UtcNow;

        // Insert with non-default status first to avoid EF skipping the Status column due to HasDefaultValue(Unknown).
        // ServerStatus.Online = 0 is the CLR default, so EF omits it from INSERT and lets the DB default ('Unknown') apply.
        // We work around this by inserting with Maintenance and immediately updating to the intended status.
        var asura = new GameServer { Name = "Asura", Status = ServerStatus.Maintenance, LastCheckedAt = now, CreatedAt = now.AddDays(-30) };
        var bahamut = new GameServer { Name = "Bahamut", Status = ServerStatus.Maintenance, LastCheckedAt = now, CreatedAt = now.AddDays(-30) };
        db.GameServers.AddRange(asura, bahamut);
        await db.SaveChangesAsync();

        // Now set Asura to Online via a direct update (avoids EF sentinel issue for value 0)
        asura.Status = ServerStatus.Online;
        db.Entry(asura).Property(s => s.Status).IsModified = true;
        await db.SaveChangesAsync();

        // Asura: online for 30 days
        db.ServerStatusChanges.Add(new ServerStatusChange
        {
            GameServerId = asura.Id,
            Status = ServerStatus.Online,
            StartedAt = now.AddDays(-30),
            EndedAt = null
        });

        // Bahamut: online for 29 days, then maintenance for 1 day
        db.ServerStatusChanges.Add(new ServerStatusChange
        {
            GameServerId = bahamut.Id,
            Status = ServerStatus.Online,
            StartedAt = now.AddDays(-30),
            EndedAt = now.AddDays(-1)
        });
        db.ServerStatusChanges.Add(new ServerStatusChange
        {
            GameServerId = bahamut.Id,
            Status = ServerStatus.Maintenance,
            StartedAt = now.AddDays(-1),
            EndedAt = null
        });

        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Analytics_ReturnsAllSections()
    {
        await SeedServersAsync();

        var response = await _client.GetAsync("/api/servers/analytics?days=31");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.True(json.TryGetProperty("serviceHealth", out var health));
        Assert.True(health.TryGetProperty("status", out _));
        Assert.True(health.TryGetProperty("onlinePercent", out _));
        Assert.True(health.TryGetProperty("uptimePercent", out _));
        Assert.True(health.TryGetProperty("totalServers", out var total));
        Assert.Equal(2, total.GetInt32());

        Assert.True(json.TryGetProperty("uptimeTrend", out var trend));
        Assert.True(trend.GetArrayLength() > 0);

        Assert.True(json.TryGetProperty("serverRankings", out var rankings));
        Assert.Equal(2, rankings.GetArrayLength());

        Assert.True(json.TryGetProperty("heatmap", out var heatmap));
        Assert.Equal(2, heatmap.GetArrayLength());

        Assert.True(json.TryGetProperty("recentIncidents", out _));
    }

    [Fact]
    public async Task Analytics_HealthStatus_ReflectsCurrentState()
    {
        await SeedServersAsync();

        var json = await _client.GetFromJsonAsync<JsonElement>("/api/servers/analytics?days=32");
        var health = json.GetProperty("serviceHealth");

        // 1 of 2 servers online = 50%, which is "Degraded"
        Assert.Equal("Degraded", health.GetProperty("status").GetString());
        Assert.Equal(50, health.GetProperty("onlinePercent").GetDouble());
        Assert.Equal(1, health.GetProperty("onlineServers").GetInt32());
    }

    [Fact]
    public async Task Analytics_Rankings_OrderedByUptime()
    {
        await SeedServersAsync();

        var json = await _client.GetFromJsonAsync<JsonElement>("/api/servers/analytics?days=33");
        var rankings = json.GetProperty("serverRankings");

        var first = rankings[0].GetProperty("name").GetString();
        var second = rankings[1].GetProperty("name").GetString();
        Assert.Equal("Asura", first); // 100% uptime
        Assert.Equal("Bahamut", second); // ~96.67% uptime
    }

    [Fact]
    public async Task Analytics_AllTime_WorksWithDaysZero()
    {
        await SeedServersAsync();

        var response = await _client.GetAsync("/api/servers/analytics?days=0");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task History_IncludesUptimeTrend()
    {
        await SeedServersAsync();

        var json = await _client.GetFromJsonAsync<JsonElement>("/api/servers/Asura/history?days=7");

        Assert.True(json.TryGetProperty("uptimeTrend", out var trend));
        Assert.True(trend.GetArrayLength() > 0);

        // Asura is always online, so all trend points should be 100
        foreach (var point in trend.EnumerateArray())
        {
            Assert.Equal(100.0, point.GetProperty("percent").GetDouble());
        }
    }

    [Fact]
    public async Task History_DaysZero_LiftsCapAndReturnsData()
    {
        await SeedServersAsync();

        var response = await _client.GetAsync("/api/servers/Asura/history?days=0");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, json.GetProperty("days").GetInt32());
    }

    [Fact]
    public async Task Analytics_EmptyDatabase_ReturnsEmptyResult()
    {
        // Use a unique days value to avoid cache collision with seeded tests
        var response = await _client.GetAsync("/api/servers/analytics?days=29");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        var health = json.GetProperty("serviceHealth");
        Assert.Equal(0, health.GetProperty("totalServers").GetInt32());
    }
}
