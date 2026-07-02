using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Testcontainers.MsSql;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Api.Tests.Controllers;

public class EconomyServersTests : IAsyncLifetime
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

    private async Task SetMasterAsync(bool enabled)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var s = await db.ScraperSettings.FirstOrDefaultAsync(x => x.Id == 1)
                ?? db.ScraperSettings.Add(new ScraperSetting { Id = 1 }).Entity;
        s.MasterEnabled = enabled;
        s.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
    }

    private async Task<int> AddServerAsync(string name, bool scrapeEnabled, bool withEndpoint)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
        var gs = new GameServer
        {
            Name = name,
            Status = ServerStatus.Online,
            LastCheckedAt = DateTimeOffset.UtcNow,
            CreatedAt = DateTimeOffset.UtcNow,
            ScrapeEnabled = scrapeEnabled,
            SearchHost = withEndpoint ? "1.2.3.4" : null,
            SearchPort = withEndpoint ? 54002 : null,
        };
        db.GameServers.Add(gs);
        await db.SaveChangesAsync();
        return gs.Id;
    }

    private record ServerDto(int Id, string Name);

    [Fact]
    public async Task Servers_MasterOn_ReturnsOnlyFullyEnabledWorlds()
    {
        await SetMasterAsync(true);
        await AddServerAsync("Siren", scrapeEnabled: true, withEndpoint: true);   // included
        await AddServerAsync("Asura", scrapeEnabled: false, withEndpoint: true);  // excluded (scrape off)
        await AddServerAsync("Bahamut", scrapeEnabled: true, withEndpoint: false);// excluded (no endpoint)

        var resp = await _client.GetAsync("/api/economy/servers");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<List<ServerDto>>();
        Assert.NotNull(body);
        Assert.Single(body!);
        Assert.Equal("Siren", body![0].Name);
    }

    [Fact]
    public async Task Servers_MasterOff_ReturnsEmpty()
    {
        await SetMasterAsync(false);
        await AddServerAsync("Siren", scrapeEnabled: true, withEndpoint: true);

        var resp = await _client.GetAsync("/api/economy/servers");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<List<ServerDto>>();
        Assert.NotNull(body);
        Assert.Empty(body!);
    }
}
