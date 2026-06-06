namespace Vanalytics.Core.DTOs.GearSets;

public class OwnedEquipmentItem
{
    public int ItemId { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public string? IconPath { get; set; }
    /// <summary>Equip-slot bitmask from GameItem.Slots; client filters by slot.</summary>
    public int? Slots { get; set; }
    public List<string> Augments { get; set; } = [];
}
