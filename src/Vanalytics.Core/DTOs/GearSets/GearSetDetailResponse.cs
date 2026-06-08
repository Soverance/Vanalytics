namespace Vanalytics.Core.DTOs.GearSets;

public class GearSetDetailResponse
{
    public long Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Job { get; set; }
    public string Category { get; set; } = "Other";
    public List<string> Tags { get; set; } = [];
    public List<GearSetSlotDto> Slots { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
