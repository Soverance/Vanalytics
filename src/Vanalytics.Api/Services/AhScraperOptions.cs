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

    /// <summary>CIDR blocks to enumerate during search-server discovery.</summary>
    public string[] DiscoveryCidrs { get; set; } =
    [
        // "202.67.53.0/24",
        // "202.67.54.0/24",
        // "202.67.62.0/24",
        // "124.150.152.0/24",
        //"124.150.144.0/20", // this is likely to be the full range of Square Enix servers
        "124.150.154.0/24", // confirmed via live capture: Siren search server is 124.150.154.71, seems like the 17 other search servers are also in this range
    ];

    /// <summary>Minimum overlapping character names required to consider a roster-to-world match valid.</summary>
    public int MappingThreshold { get; set; } = 3;

    /// <summary>Maximum concurrent IP probes during discovery.</summary>
    public int DiscoveryConcurrency { get; set; } = 8;

    /// <summary>Milliseconds allowed per probe attempt before timing out.</summary>
    public int ProbeTimeoutMs { get; set; } = 3000;

    /// <summary>Item IDs to pull sample AH sales for from each discovered endpoint, as a
    /// world fingerprint. Edited directly like <see cref="DiscoveryCidrs"/>. 2=Simple Bed,
    /// 4096=Fire Crystal, 4128=Ice Crystal.</summary>
    public int[] DiscoveryProbeItemIds { get; set; } = [2, 4096, 4128];
}
