using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Soverance.Auth.Models;
using Testcontainers.MsSql;
using Vanalytics.Api.Services;
using Vanalytics.Api.Services.SearchServer;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Models;
using Vanalytics.Core.Services.SearchServer;
using Vanalytics.Data;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

file sealed class FakeSearchClient(IReadOnlyList<string> names) : ISearchServerClient
{
    public Task ConnectAsync(string host, int port, CancellationToken ct) => Task.CompletedTask;

    public Task<IReadOnlyList<PlayerRecord>> GetOnlinePlayersAsync(CancellationToken ct)
    {
        IReadOnlyList<PlayerRecord> list = names
            .Select(n => new PlayerRecord(n, 0, 0, 0, 0, 0, 0, 0, 0, 0))
            .ToList();
        return Task.FromResult(list);
    }

    public Task<IReadOnlyList<AhSale>> GetSalesHistoryAsync(int itemId, bool stack, CancellationToken ct)
        => Task.FromResult<IReadOnlyList<AhSale>>(Array.Empty<AhSale>());

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}

file sealed class FakeProber(IReadOnlyCollection<string> liveIps) : IDiscoveryProber
{
    public Task<bool> IsSearchServerAsync(string host, int port, int probeItemId, int timeoutMs, CancellationToken ct)
        => Task.FromResult(liveIps.Contains(host));
}

file sealed class FakeClientFactory(ISearchServerClient client) : ISearchServerClientFactory
{
    public ISearchServerClient Create() => client;
}

// ---------------------------------------------------------------------------
// Test class
// ---------------------------------------------------------------------------

public class DiscoveryOrchestratorTests : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private WebApplicationFactory<Program> _factory = null!;

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

        _ = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        await _factory.DisposeAsync();
        await _container.DisposeAsync();
    }

    private VanalyticsDbContext NewDb()
    {
        var scope = _factory.Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
    }

    private IServiceScopeFactory ScopeFor(VanalyticsDbContext _)
        => _factory.Services.GetRequiredService<IServiceScopeFactory>();

    [Fact]
    public async Task RunDiscovery_MapsLiveEndpointToWorld_WritesCandidate_NoScrapeEnable()
    {
        await using var db = NewDb();
        db.GameServers.Add(new GameServer
        {
            Name = "Asura",
            Status = ServerStatus.Online,
            LastCheckedAt = DateTimeOffset.UtcNow,
            CreatedAt = DateTimeOffset.UtcNow,
        });
        // Characters have a FK to Users — create a user row first.
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = "test@example.com",
            Username = "testuser",
            PasswordHash = "h",
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow,
        };
        db.Users.Add(user);
        db.Characters.AddRange(
            new Character { Id = Guid.NewGuid(), UserId = user.Id, Name = "Alpha", Server = "Asura", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow },
            new Character { Id = Guid.NewGuid(), UserId = user.Id, Name = "Beta",  Server = "Asura", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow },
            new Character { Id = Guid.NewGuid(), UserId = user.Id, Name = "Gamma", Server = "Asura", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow });
        await db.SaveChangesAsync();

        var fakeClient = new FakeSearchClient(new[] { "Alpha", "Beta", "Gamma" });
        var options = new AhScraperOptions { MappingThreshold = 2, DiscoveryConcurrency = 4, ProbeTimeoutMs = 1000 };
        var fakeProber = new FakeProber(liveIps: new[] { "10.0.0.1" });
        var orch = new DiscoveryOrchestrator(NullLogger<DiscoveryOrchestrator>.Instance, _factory.Services.GetRequiredService<IServiceScopeFactory>(), options, fakeProber);

        var progress = new Progress<DiscoveryProgressEvent>();
        var result = await orch.RunDiscoveryAsync(
            ips: new[] { "10.0.0.1" },
            clientFactory: new FakeClientFactory(fakeClient),
            prober: new FakeProber(liveIps: new[] { "10.0.0.1" }),
            progress: progress,
            scopes: ScopeFor(db),
            ct: CancellationToken.None);

        await using var db2 = NewDb();
        var asura = await db2.GameServers.FirstAsync(s => s.Name == "Asura");
        Assert.Equal("10.0.0.1", asura.SearchHost);
        Assert.Equal(54002, asura.SearchPort);
        Assert.Equal(MappingSource.Auto, asura.MappingSource);
        Assert.False(asura.ScrapeEnabled);     // never auto-enabled
        Assert.Equal(1, result.Mapped);
    }
}
