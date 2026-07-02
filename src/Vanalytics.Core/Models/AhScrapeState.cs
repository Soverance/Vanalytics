namespace Vanalytics.Core.Models;

/// <summary>Per (world, item, single/stack) scrape cursor for least-recently-scraped fairness.</summary>
public class AhScrapeState
{
    public long Id { get; set; }
    public int ServerId { get; set; }
    public int ItemId { get; set; }
    public bool Stack { get; set; }
    public DateTimeOffset? LastScrapedAt { get; set; }
    /// <summary>Count currently listed on the AH (singles or stacks, per <see cref="Stack"/>) as of the last scrape.</summary>
    public int? LastQuantity { get; set; }

    public GameServer Server { get; set; } = null!;
    public GameItem Item { get; set; } = null!;
}
