using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Testcontainers.MsSql;
using Vanalytics.Api.Services;
using Vanalytics.Api.Services.SearchServer;
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

file sealed class FakeProber(string liveIp) : IDiscoveryProber
{
    public Task<bool> IsSearchServerAsync(string host, int port, int probeItemId, int timeoutMs, CancellationToken ct)
        => Task.FromResult(host == liveIp);
}

file sealed class FakeClientFactory(Dictionary<int, List<AhSale>> salesByItem) : ISearchServerClientFactory
{
    public ISearchServerClient Create() => new FakeClient(salesByItem);
}

file sealed class FakeClient(Dictionary<int, List<AhSale>> salesByItem) : ISearchServerClient
{
    public Task ConnectAsync(string host, int port, CancellationToken ct) => Task.CompletedTask;
    public Task<IReadOnlyList<AhSale>> GetSalesHistoryAsync(int itemId, bool stack, CancellationToken ct)
        => Task.FromResult<IReadOnlyList<AhSale>>(salesByItem.TryGetValue(itemId, out var s) ? s : new List<AhSale>());
    public Task<IReadOnlyList<PlayerRecord>> GetOnlinePlayersAsync(CancellationToken ct)
        => Task.FromResult<IReadOnlyList<PlayerRecord>>(Array.Empty<PlayerRecord>());
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}

file sealed class NoopProgress : IProgress<DiscoveryProgressEvent>
{
    public void Report(DiscoveryProgressEvent value) { }
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

    private IServiceScopeFactory ScopeFactory
        => _factory.Services.GetRequiredService<IServiceScopeFactory>();

    private static List<AhSale> SixSales() =>
        Enumerable.Range(0, 6)
            .Select(i => new AhSale(100 + i, DateTimeOffset.FromUnixTimeSeconds(1_700_000_000 + i), "S", "B", false))
            .ToList();

    [Fact]
    public async Task RunDiscovery_PersistsDiscoveredEndpoint_WithSampleSales()
    {
        // Arrange: prober returns true only for 10.0.0.5; fake client returns 6 sales for item 4096.
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        var options = new AhScraperOptions
        {
            DiscoveryProbeItemIds = [4096],
            DiscoveryConcurrency = 4,
            ProbeTimeoutMs = 1000,
        };
        var orchestrator = new DiscoveryOrchestrator(
            NullLogger<DiscoveryOrchestrator>.Instance,
            ScopeFactory,
            options,
            new FakeProber(liveIp: "10.0.0.5"));

        var result = await orchestrator.RunDiscoveryAsync(
            ips: new[] { "10.0.0.5", "10.0.0.6" },
            clientFactory: new FakeClientFactory(salesByItem: new() { [4096] = SixSales() }),
            prober: new FakeProber(liveIp: "10.0.0.5"),
            progress: new NoopProgress(),
            scopes: ScopeFactory,
            ct: CancellationToken.None);

        Assert.Equal(1, result.Found);
        var row = await db.DiscoveredEndpoints.AsNoTracking().SingleAsync(e => e.Ip == "10.0.0.5");
        Assert.Equal(54002, row.Port);
        var samples = DiscoverySamples.Deserialize(row.SampleSalesJson);
        var item = samples.Single(s => s.ItemId == 4096);
        Assert.Equal(5, item.Sales.Count);                       // capped at 5 most recent
        Assert.True(item.Sales[0].SoldAt >= item.Sales[1].SoldAt); // descending by SoldAt
    }

    [Fact]
    public async Task RunDiscovery_Rescan_PreservesMappedServerId()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

        // Seed a real GameServer so the FK reference is valid.
        var gs = new Vanalytics.Core.Models.GameServer
        {
            Name = "Siren",
            Status = Vanalytics.Core.Enums.ServerStatus.Online,
            LastCheckedAt = DateTimeOffset.UtcNow,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        db.GameServers.Add(gs);
        await db.SaveChangesAsync();

        db.DiscoveredEndpoints.Add(new DiscoveredEndpoint
        {
            Ip = "10.0.1.5", Port = 54002, ScannedAt = DateTimeOffset.UtcNow.AddDays(-1),
            SampleSalesJson = "[]", MappedServerId = gs.Id,
        });
        await db.SaveChangesAsync();

        var options = new AhScraperOptions
        {
            DiscoveryProbeItemIds = [4096],
            DiscoveryConcurrency = 4,
            ProbeTimeoutMs = 1000,
        };
        var orchestrator = new DiscoveryOrchestrator(
            NullLogger<DiscoveryOrchestrator>.Instance,
            ScopeFactory,
            options,
            new FakeProber(liveIp: "10.0.1.5"));

        await orchestrator.RunDiscoveryAsync(
            new[] { "10.0.1.5" },
            new FakeClientFactory(salesByItem: new() { [4096] = SixSales() }),
            new FakeProber(liveIp: "10.0.1.5"),
            new NoopProgress(), ScopeFactory, CancellationToken.None);

        var row = await db.DiscoveredEndpoints.AsNoTracking().SingleAsync(e => e.Ip == "10.0.1.5");
        Assert.Equal(gs.Id, row.MappedServerId);                 // mapping preserved
        Assert.NotEqual("[]", row.SampleSalesJson);              // samples refreshed
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
