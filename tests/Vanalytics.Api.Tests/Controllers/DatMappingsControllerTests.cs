using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.MsSql;
using Vanalytics.Core.Models;
using Vanalytics.Data;

namespace Vanalytics.Api.Tests.Controllers;

public class DatMappingsControllerTests : IAsyncLifetime
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

        // Seed test zone before any tests run to avoid cache ordering issues
        // (IMemoryCache is singleton, so the first request caches for 30 minutes)
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        db.Zones.Add(new Zone
        {
            Id = 100,
            Name = "West Ronfaure",
            ModelPath = "ROM/0/108.DAT",
            DialogPath = "ROM/2/29.DAT",
            NpcPath = "ROM/2/129.DAT",
            EventPath = "ROM/0/73.DAT",
            MapPaths = "ROM/283/3.DAT;ROM/283/4.DAT",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _container.DisposeAsync();
    }

    [Fact]
    public async Task GetAll_ReturnsOk_WithAllCategories()
    {
        var response = await _client.GetAsync("/api/dat-mappings");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.True(json.TryGetProperty("generatedAt", out _));
        Assert.True(json.TryGetProperty("equipment", out var equipment));
        Assert.True(json.TryGetProperty("npcs", out var npcs));
        Assert.True(json.TryGetProperty("zones", out _));
        Assert.True(json.TryGetProperty("faces", out var faces));
        Assert.True(json.TryGetProperty("skeletons", out var skeletons));
        Assert.True(json.TryGetProperty("animations", out var animations));

        Assert.True(faces.GetArrayLength() > 0);
        Assert.Equal(8, skeletons.GetArrayLength());
        Assert.True(animations.GetArrayLength() > 0);
        Assert.True(npcs.GetArrayLength() > 0);
    }

    [Fact]
    public async Task GetAll_Zones_ReturnsSeededData()
    {
        // Zone seeded in InitializeAsync
        var json = await _client.GetFromJsonAsync<JsonElement>("/api/dat-mappings");
        var zones = json.GetProperty("zones");

        var westRon = zones.EnumerateArray().FirstOrDefault(z =>
            z.GetProperty("name").GetString() == "West Ronfaure");

        Assert.Equal("ROM/0/108.DAT", westRon.GetProperty("modelPath").GetString());
        Assert.Equal("ROM/2/29.DAT", westRon.GetProperty("dialogPath").GetString());

        var mapPaths = westRon.GetProperty("mapPaths");
        Assert.Equal(2, mapPaths.GetArrayLength());
        Assert.Equal("ROM/283/3.DAT", mapPaths[0].GetString());
        Assert.Equal("ROM/283/4.DAT", mapPaths[1].GetString());
    }

    [Fact]
    public async Task GetAll_Skeletons_HasAllRaces()
    {
        var json = await _client.GetFromJsonAsync<JsonElement>("/api/dat-mappings");
        var skeletons = json.GetProperty("skeletons");

        Assert.Equal(8, skeletons.GetArrayLength());

        var first = skeletons[0];
        Assert.True(first.TryGetProperty("race", out _));
        Assert.True(first.TryGetProperty("datPath", out _));
    }

    [Fact]
    public async Task GetAll_IsPublic_NoAuthRequired()
    {
        var response = await _client.GetAsync("/api/dat-mappings");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
