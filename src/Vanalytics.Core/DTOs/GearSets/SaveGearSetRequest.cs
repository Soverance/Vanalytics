namespace Vanalytics.Core.DTOs.GearSets;

public class SaveGearSetRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Job { get; set; }
    public List<GearSetSlotDto> Slots { get; set; } = [];
}
