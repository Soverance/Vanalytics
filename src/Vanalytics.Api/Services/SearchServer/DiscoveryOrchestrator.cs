using System.Collections.Concurrent;
using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using Vanalytics.Api.Services;
using Vanalytics.Core.Models;
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
                    List<string> cidrLines;
                    using (var scope = scopeFactory.CreateScope())
                    {
                        var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
                        var setting = await db.ScraperSettings.AsNoTracking()
                            .FirstOrDefaultAsync(s => s.Id == 1, cts.Token);
                        cidrLines = CidrRange.ParseCidrLines(setting?.DiscoveryCidrsText).ToList();
                    }

                    if (cidrLines.Count == 0)
                    {
                        progress.Report(new DiscoveryProgressEvent
                        {
                            Type = "Completed",
                            Found = 0,
                            Message = "No scan ranges configured — set them in the admin panel.",
                        });
                        return;
                    }

                    var ips = cidrLines.SelectMany(CidrRange.Enumerate);
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
    /// fetches sample AH sales from each live endpoint via <paramref name="clientFactory"/>
    /// for each configured <see cref="AhScraperOptions.DiscoveryProbeItemIds"/>,
    /// and upserts a <see cref="DiscoveredEndpoint"/> row (refreshing sample data while
    /// preserving any existing <c>MappedServerId</c>). Never maps worlds.
    /// <para>
    /// Per-IP probe failures are caught and logged; they do not abort the scan.
    /// A found IP is always persisted — even if its sales fetch fails (empty samples).
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
        var probeItemIds = options.DiscoveryProbeItemIds;

        int scanned = 0, found = 0;
        var live = new ConcurrentBag<(string Ip, string SamplesJson)>();
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
                    var samples = await FetchSamplesAsync(clientFactory, ip, probeItemIds, ct);
                    live.Add((ip, DiscoverySamples.Serialize(samples)));
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

        // Upsert discovered endpoints by (Ip, Port). Refresh samples; preserve any manual mapping.
        using (var scope = scopes.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<VanalyticsDbContext>();
            var now = DateTimeOffset.UtcNow;
            foreach (var (ip, samplesJson) in live)
            {
                var row = await db.DiscoveredEndpoints.FirstOrDefaultAsync(e => e.Ip == ip && e.Port == 54002, ct);
                if (row is null)
                {
                    db.DiscoveredEndpoints.Add(new DiscoveredEndpoint
                    {
                        Ip = ip, Port = 54002, ScannedAt = now, SampleSalesJson = samplesJson,
                    });
                }
                else
                {
                    row.ScannedAt = now;
                    row.SampleSalesJson = samplesJson;   // MappedServerId left untouched
                }
            }
            await db.SaveChangesAsync(ct);
        }

        return new DiscoveryResult(found);
    }

    /// <summary>
    /// Fetches up to 5 most-recent single-quantity sales for each probe item from one endpoint.
    /// Never throws (except on cancellation) — connect/fetch failures yield empty samples so the
    /// IP is still recorded.
    /// </summary>
    private async Task<List<ProbeItemSample>> FetchSamplesAsync(
        ISearchServerClientFactory clientFactory, string ip, int[] probeItemIds, CancellationToken ct)
    {
        var samples = new List<ProbeItemSample>();
        try
        {
            await using var client = clientFactory.Create();
            await client.ConnectAsync(ip, 54002, ct);
            foreach (var itemId in probeItemIds)
            {
                ct.ThrowIfCancellationRequested();
                try
                {
                    var sales = await client.GetSalesHistoryAsync(itemId, stack: false, ct);
                    var recent = sales
                        .OrderByDescending(s => s.SoldAt)
                        .Take(5)
                        .Select(s => new SampleSale(s.Price, s.SoldAt, s.SellerName, s.BuyerName))
                        .ToList();
                    samples.Add(new ProbeItemSample(itemId, recent));
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogDebug(ex, "Sample fetch item {ItemId} on {Ip} failed", itemId, ip);
                    samples.Add(new ProbeItemSample(itemId, new List<SampleSale>()));
                }
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogDebug(ex, "Sample connect on {Ip} failed", ip);
        }
        return samples;
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
