namespace Vanalytics.Core.Models;

/// <summary>
/// A search-server IP found by a discovery scan, with a JSON snapshot of recent sample
/// sales (the "fingerprint" the admin cross-references against FFXIAH to identify the world).
/// One row per (Ip, Port); a re-scan refreshes the samples but preserves the manual mapping.
/// </summary>
public class DiscoveredEndpoint
{
    public int Id { get; set; }
    public string Ip { get; set; } = string.Empty;
    public int Port { get; set; }
    public DateTimeOffset ScannedAt { get; set; }
    /// <summary>Serialized array of per-probe-item sample sales. See DiscoverySamples.</summary>
    public string SampleSalesJson { get; set; } = "[]";
    /// <summary>The world this IP was manually mapped to, if any.</summary>
    public int? MappedServerId { get; set; }
    public GameServer? MappedServer { get; set; }
}
