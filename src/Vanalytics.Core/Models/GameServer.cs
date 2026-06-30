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

    public List<ServerStatusChange> StatusHistory { get; set; } = [];
}
