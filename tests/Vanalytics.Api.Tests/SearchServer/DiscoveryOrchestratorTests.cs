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

/// <summary>
/// A prober that always returns false after a short delay so TryStart scans
/// complete quickly with found=0. The delay keeps the job alive long enough
/// for GetJob() to reliably return it.
/// </summary>
file sealed class FastFalseProber : IDiscoveryProber
{
    public async Task<bool> IsSearchServerAsync(string host, int port, int probeItemId, int timeoutMs, CancellationToken ct)
    {
        await Task.Delay(50, ct);
        return false;
    }
}

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

    /// <summary>
    /// Regression test for the Progress&lt;T&gt; race condition in TryStart:
    /// the terminal "Completed" event MUST reach the job's channel before
    /// TryComplete() closes it. With the old <see cref="Progress{T}"/>
    /// (thread-pool post, async) TryComplete() wins the race and the event
    /// is silently dropped. With the SyncProgress fix it arrives synchronously
    /// before TryComplete(), so ReadAllAsync drains it.
    /// </summary>
    [Fact]
    public async Task TryStart_TerminalEventReachesChannel_Completed()
    {
        // Arrange: 1-IP CIDR, prober always returns false after a short delay.
        var options = new AhScraperOptions
        {
            DiscoveryCidrs = ["127.0.0.1/32"],   // 1 IP only
            ProbeTimeoutMs = 500,
            DiscoveryConcurrency = 1,
        };

        var orch = new DiscoveryOrchestrator(
            NullLogger<DiscoveryOrchestrator>.Instance,
            _factory.Services.GetRequiredService<IServiceScopeFactory>(),
            options,
            new FastFalseProber());

        var codec = new Vanalytics.Core.Services.SearchServer.SearchPacketCodec();

        // Act: start the scan via the public TryStart path (this is the path that has the race).
        bool started = orch.TryStart(codec, out _);
        Assert.True(started, "TryStart must return true for a fresh orchestrator");

        var job = orch.GetJob();
        Assert.NotNull(job);

        // Drain the channel. With the bug the Completed event is dropped and
        // ReadAllAsync returns only Progress events; the assertion below fails.
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        var events = new List<DiscoveryProgressEvent>();
        await foreach (var e in job!.Channel.Reader.ReadAllAsync(cts.Token))
        {
            events.Add(e);
        }

        // Assert: a "Completed" terminal event must be present (found=0 since the
        // prober always returns false).
        var completed = events.FirstOrDefault(e => e.Type == "Completed");
        Assert.NotNull(completed);
        Assert.Equal(0, completed!.Found);
    }
}
