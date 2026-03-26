using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class InventoryChange
{
    public long Id { get; set; }
    public Guid CharacterId { get; set; }
    public int ItemId { get; set; }
    public InventoryBag Bag { get; set; }
    public int SlotIndex { get; set; }
    public InventoryChangeType ChangeType { get; set; }
    public int QuantityBefore { get; set; }
    public int QuantityAfter { get; set; }
    public DateTimeOffset ChangedAt { get; set; }

    public Character Character { get; set; } = null!;
}
