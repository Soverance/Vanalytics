using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class GameServer
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public ServerStatus Status { get; set; } = ServerStatus.Unknown;
    public DateTimeOffset LastCheckedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>Search ("cache") server host for this world. Null = not discovered/seeded.</summary>
    public string? SearchHost { get; set; }
    /// <summary>Search server TCP port (retail default 54002).</summary>
    public int? SearchPort { get; set; }
    /// <summary>When false (or endpoint missing), the AH scraper skips this world.</summary>
    public bool ScrapeEnabled { get; set; }

    public DateTimeOffset? LastDiscoveredAt { get; set; }
    public bool? EndpointHealthy { get; set; }
    public DateTimeOffset? LastProbedAt { get; set; }

    /// <summary>Last per-world scrape error message (null when the most recent attempt succeeded).</summary>
    public string? LastScrapeError { get; set; }
    /// <summary>When <see cref="LastScrapeError"/> was recorded.</summary>
    public DateTimeOffset? LastScrapeErrorAt { get; set; }
    public Vanalytics.Core.Enums.MappingSource MappingSource { get; set; } = Vanalytics.Core.Enums.MappingSource.Unmapped;
    public int? MappingConfidence { get; set; }

    public List<ServerStatusChange> StatusHistory { get; set; } = [];
}
