namespace Vanalytics.Api.Services;

public class AhScraperOptions
{
    /// <summary>When false (the default) the scraper exits immediately on startup — safe to deploy without search-server access.</summary>
    public bool Enabled { get; set; } = false;
    public int BatchSize { get; set; } = 200;
    /// <summary>Milliseconds to wait between item requests to the search server (good-citizen pacing).</summary>
    public int InterRequestDelayMs { get; set; } = 150;
    /// <summary>Milliseconds allowed for the TCP connect + handshake per world before aborting that world's cycle.</summary>
    public int PerWorldConnectTimeoutMs { get; set; } = 10_000;
    /// <summary>Seconds to idle between full scrape cycles across all enabled worlds.</summary>
    public int CycleIdleDelaySeconds { get; set; } = 300;
}
