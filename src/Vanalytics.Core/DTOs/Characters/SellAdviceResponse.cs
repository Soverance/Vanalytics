namespace Vanalytics.Core.DTOs.Characters;

/// <summary>
/// Sell Advisor payload: every held item that is vendorable (BaseSell &gt; 0) or
/// auctionable (NoAuction flag unset), with the character's home-world AH medians
/// (last 30 days, split single/stack). The "best of single/stack" value and the
/// vendor-vs-AH recommendation are computed client-side.
/// </summary>
public class SellAdviceResponse
{
    /// <summary>The character's home world (Character.Server), echoed for display.</summary>
    public string ServerName { get; set; } = string.Empty;

    /// <summary>False when the home world has no GameServer row (no AH data available).</summary>
    public bool ServerScraped { get; set; }

    public List<SellAdviceItemResponse> Items { get; set; } = new();
}

public class SellAdviceItemResponse
{
    public int ItemId { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public string? IconPath { get; set; }
    public string Bag { get; set; } = string.Empty;
    public int SlotIndex { get; set; }
    public int Quantity { get; set; }
    public int StackSize { get; set; }

    /// <summary>Per-unit NPC vendor price. Null or 0 = not vendorable.</summary>
    public int? BaseSell { get; set; }

    /// <summary>True when the item cannot be sold on the AH (Flags &amp; 0x0040).</summary>
    public bool IsNoAuction { get; set; }

    /// <summary>Median single-sale (StackSize==1) price over the last 30 days; null if none.</summary>
    public int? SingleMedian { get; set; }
    public int SingleCount { get; set; }

    /// <summary>Median stack-sale (StackSize&gt;1) price over the last 30 days; null if none.</summary>
    public int? StackMedian { get; set; }
    public int StackCount { get; set; }

    /// <summary>Most recent sale timestamp across single/stack in the window; null if none.</summary>
    public DateTimeOffset? LastSoldAt { get; set; }
}
