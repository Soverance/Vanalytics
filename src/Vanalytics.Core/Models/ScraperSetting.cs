namespace Vanalytics.Core.Models;

/// <summary>Single-row global settings for the AH scraper. Id is always 1.</summary>
public class ScraperSetting
{
    public int Id { get; set; }
    /// <summary>DB-backed master on/off. The scraper re-reads this each cycle. Default false.</summary>
    public bool MasterEnabled { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid? UpdatedByUserId { get; set; }
    /// <summary>Newline-separated CIDR ranges for the discovery scanner. Null = none configured.
    /// Stored in the DB (never in source) so SE IP ranges stay out of the repository.</summary>
    public string? DiscoveryCidrsText { get; set; }
}
