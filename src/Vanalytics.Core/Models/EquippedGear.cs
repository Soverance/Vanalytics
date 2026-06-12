using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class EquippedGear
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public EquipSlot Slot { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public int ItemId { get; set; }

    /// <summary>
    /// JSON-serialized array of augment strings (e.g. ["DEX+9","Weapon skill damage +8%"]),
    /// decoded from the item's extdata by the addon. Null when the item has no augments.
    /// </summary>
    public string? AugmentsJson { get; set; }

    public Character Character { get; set; } = null!;
}
