using System.Collections.Concurrent;
using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services;
using Vanalytics.Core.Enums;
using Vanalytics.Core.Services.SearchServer;
using Vanalytics.Data;

namespace Vanalytics.Api.Services.SearchServer;

public class DiscoveryJob
{
    public required CancellationTokenSource Cts { get; init; }
    public required Channel<DiscoveryProgressEvent> Channel { get; init; }
    public DiscoveryProgressEvent? LastEvent { get; set; }
}

public class DiscoveryOrchestrator(
    ILogger<DiscoveryOrchestrator> logger,
    IServiceScopeFactory scopeFactory,
    AhScraperOptions options,
    IDiscoveryProber prober)
{
    private DiscoveryJob? _job;
    private readonly object _lock = new();

    public DiscoveryJob? GetJob() { lock (_lock) return _job; }

    /// <summary>
    /// Starts a background discovery scan using the DI-injected <see cref="IDiscoveryProber"/>
    /// and the production <see cref="SearchServerClient"/>. Returns false if a scan is already running.
    /// </summary>
    public bool TryStart(SearchPacketCodec codec, out string error)
    {
        lock (_lock)
        {
            if (_job is not null) { error = "Discovery already running"; return false; }

            var channel = Channel.CreateUnbounded<DiscoveryProgressEvent>();
            var cts = new CancellationTokenSource();
            var job = new DiscoveryJob { Cts = cts, Channel = channel };
            _job = job;
            error = "";

            var started = new DiscoveryProgressEvent { Type = "Started" };
            job.LastEvent = started;
            channel.Writer.TryWrite(started);

            _ = Task.Run(async () =>
            {
                // Use a synchronous IProgress<T> implementation instead of Progress<T>.
                // Progress<T>.Report posts the callback to the thread pool (no
                // SynchronizationContext in ASP.NET Core), so TryComplete() in the finally
                // block races against the terminal-event TryWrite and wins — the Completed /
                // Cancelled / Failed event is silently dropped. SyncProgress calls the
                // handler on the calling thread, so the write completes before the finally runs.
                IProgress<DiscoveryProgressEvent> progress = new SyncProgress(e =>
                {
                    job.LastEvent = e;
                    channel.Writer.TryWrite(e);
                });

                try
                {
                    var ips = options.DiscoveryCidrs.SelectMany(CidrRange.Enumerate);
                    var result = await RunDiscoveryAsync(
                        ips,
                        new RealClientFactory(codec),
                        prober,
                        progress,
                        scopeFactory,
                        cts.Token);

                    progress.Report(new DiscoveryProgressEvent
                    {
                        Type = "Completed",
                        Found = result.Found,
                        Mapped = result.Mapped,
                        Unmapped = result.Unmapped,
                    });
                }
                catch (OperationCanceledException)
                {
                    progress.Report(
                        new DiscoveryProgressEvent { Type = "Cancelled" });
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Discovery scan failed");
                    progress.Report(
                        new DiscoveryProgressEvent { Type = "Failed", Message = ex.Message });
                }
                finally
                {
                    channel.Writer.TryComplete();
                    lock (_lock) _job = null;
                    cts.Dispose();
                }
            });

            return true;
        }
    }

    public bool TryCancel()
    {
        lock (_lock)
        {
            if (_job is null) return false;
            _job.Cts.Cancel();
            return true;
        }
    }

    // -----------------------------------------------------------------------
    // Testable core — called directly by tests with injected fakes
    // -----------------------------------------------------------------------

    /// <summary>
    /// Scans <paramref name="ips"/>, probes each via <paramref name="prober"/>,
    /// fetches the online roster from live endpoints via <paramref name="clientFactory"/>,
    /// maps each to a world, and writes discovery columns to the matching <c>GameServer</c> row.
    /// <para>
    /// NEVER sets <c>ScrapeEnabled</c> — that is an explicit admin action only.
    /// Per-IP failures are caught and logged; they do not abort the scan.
    /// Respects <paramref name="ct"/> cancellation.
    /// </para>
    /// </summary>
    public async Task<DiscoveryResult> RunDiscoveryAsync(
        IEnumerable<string> ips,
        ISearchServerClientFactory clientFactory,
        IDiscoveryProber prober,
        IProgress<DiscoveryProgressEvent> progress,
        IServiceScopeFactory scopes,
        CancellationToken ct)
    {
        var ipList = ips.ToList();

        // Build a Characters-by-server lookup once (read-only snapshot).
        Dictionary<string, IReadOnlyCollection<string>> byServer;
        using (var scope = scopes.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            byServer = (await db.Characters
                    .AsNoTracking()
                    .Select(c => new { c.Name, c.Server })
                    .ToListAsync(ct))
                .GroupBy(c => c.Server)
                .ToDictionary(
                    g => g.Key,
                    g => (IReadOnlyCollection<string>)g.Select(x => x.Name).ToList());
        }

        int scanned = 0, found = 0;
        var liveEndpoints = new ConcurrentBag<(string Ip, IReadOnlyList<PlayerRecord> Roster)>();
        var sem = new SemaphoreSlim(Math.Max(1, options.DiscoveryConcurrency));

        await Task.WhenAll(ipList.Select(async ip =>
        {
            await sem.WaitAsync(ct);
            try
            {
                bool isLive = await prober.IsSearchServerAsync(
                    ip, 54002, probeItemId: 4096, timeoutMs: options.ProbeTimeoutMs, ct);

                if (isLive)
                {
                    Interlocked.Increment(ref found);
                    await using var client = clientFactory.Create();
                    await client.ConnectAsync(ip, 54002, ct);
                    var roster = await client.GetOnlinePlayersAsync(ct);
                    liveEndpoints.Add((ip, roster));
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogDebug(ex, "Probe {Ip} failed — skipping", ip);
            }
            finally
            {
                sem.Release();
                int s = Interlocked.Increment(ref scanned);
                progress.Report(new DiscoveryProgressEvent
                {
                    Type = "Progress",
                    Scanned = s,
                    Total = ipList.Count,
                    Found = Volatile.Read(ref found),
                });
            }
        }));

        ct.ThrowIfCancellationRequested();

        // Map and write candidates.
        int mapped = 0, unmapped = 0;
        using (var scope = scopes.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();

            foreach (var (ip, roster) in liveEndpoints)
            {
                var names = roster.Select(p => p.Name).ToList();
                var (server, confidence) = WorldMapper.Map(names, byServer, options.MappingThreshold);

                if (server is null)
                {
                    unmapped++;
                    continue;
                }

                var gs = await db.GameServers.FirstOrDefaultAsync(g => g.Name == server, ct);
                if (gs is null)
                {
                    unmapped++;
                    continue;
                }

                // Write discovery candidate columns only — NEVER touch ScrapeEnabled.
                gs.SearchHost = ip;
                gs.SearchPort = 54002;
                gs.MappingSource = MappingSource.Auto;
                gs.MappingConfidence = confidence;
                gs.LastDiscoveredAt = DateTimeOffset.UtcNow;
                gs.EndpointHealthy = true;
                gs.LastProbedAt = DateTimeOffset.UtcNow;
                mapped++;
            }

            await db.SaveChangesAsync(ct);
        }

        return new DiscoveryResult(found, mapped, unmapped);
    }

    // -----------------------------------------------------------------------
    // Private adapters for production use
    // -----------------------------------------------------------------------

    private sealed class RealClientFactory(SearchPacketCodec codec) : ISearchServerClientFactory
    {
        public ISearchServerClient Create() => new SearchServerClient(codec);
    }

    /// <summary>
    /// A synchronous <see cref="IProgress{T}"/> that invokes the handler on the calling
    /// thread (unlike <see cref="Progress{T}"/> which posts to the captured
    /// <see cref="System.Threading.SynchronizationContext"/> — or the thread pool when
    /// there is no context, as in ASP.NET Core). Using this ensures terminal events
    /// (Completed / Cancelled / Failed) are written to the channel before the
    /// <c>finally</c> block calls <c>TryComplete()</c>.
    /// </summary>
    private sealed class SyncProgress(Action<DiscoveryProgressEvent> handler) : IProgress<DiscoveryProgressEvent>
    {
        public void Report(DiscoveryProgressEvent value) => handler(value);
    }
}

/// <summary>
/// DI-registered adapter that wraps <see cref="SearchEndpointProber"/> and satisfies
/// <see cref="IDiscoveryProber"/>. Register as the production singleton in Program.cs.
/// Tests override this binding with a hanging fake to make the 409 test deterministic.
/// </summary>
public sealed class SearchEndpointProberAdapter(SearchEndpointProber prober) : IDiscoveryProber
{
    public Task<bool> IsSearchServerAsync(string host, int port, int probeItemId, int timeoutMs, CancellationToken ct)
        => prober.IsSearchServerAsync(host, port, probeItemId, timeoutMs, ct);
}
