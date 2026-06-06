namespace Vanalytics.Core.DTOs.GearSets;

public class GearSetSummaryResponse
{
    public long Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Job { get; set; }
    public int SlotCount { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
