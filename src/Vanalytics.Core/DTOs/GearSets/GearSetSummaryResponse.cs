namespace Vanalytics.Core.DTOs.GearSets;

public class GearSetSummaryResponse
{
    public long Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Job { get; set; }
    public string Category { get; set; } = "Other";
    public List<string> Tags { get; set; } = [];
    public int SlotCount { get; set; }
    /// <summary>Slots that didn't resolve to a catalog item (ItemId 0).</summary>
    public int UnresolvedCount { get; set; }
    /// <summary>Resolved slots whose item the character doesn't currently own.
    /// Null when ownership wasn't computed (e.g. public/read-only views).</summary>
    public int? NotOwnedCount { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
