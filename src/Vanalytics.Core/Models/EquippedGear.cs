using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class EquippedGear
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public EquipSlot Slot { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public int ItemId { get; set; }

    public Character Character { get; set; } = null!;
}
