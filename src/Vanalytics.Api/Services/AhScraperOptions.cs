namespace Vanalytics.Api.Services;

public class AhScraperOptions
{
    public int BatchSize { get; set; } = 200;
    /// <summary>Milliseconds to wait between item requests to the search server (good-citizen pacing).</summary>
    public int InterRequestDelayMs { get; set; } = 150;
    /// <summary>Milliseconds allowed for the TCP connect + handshake per world before aborting that world's cycle.</summary>
    public int PerWorldConnectTimeoutMs { get; set; } = 10_000;
    /// <summary>Seconds to idle between full scrape cycles across all enabled worlds.</summary>
    public int CycleIdleDelaySeconds { get; set; } = 300;

    // -----------------------------------------------------------------------
    // Discovery (CIDR range scan) settings
    // -----------------------------------------------------------------------

    /// <summary>Maximum concurrent IP probes during discovery.</summary>
    public int DiscoveryConcurrency { get; set; } = 8;

    /// <summary>Milliseconds allowed per probe attempt before timing out.</summary>
    public int ProbeTimeoutMs { get; set; } = 3000;

    /// <summary>Item IDs to pull sample AH sales for from each discovered endpoint, as a
    /// world fingerprint. 2=Simple Bed, 4096=Fire Crystal, 4128=Ice Crystal.</summary>
    public int[] DiscoveryProbeItemIds { get; set; } = [2, 4096, 4128];
}
