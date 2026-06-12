using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class CharacterInventory
{
    public long Id { get; set; }
    public Guid CharacterId { get; set; }
    public int ItemId { get; set; }
    public InventoryBag Bag { get; set; }
    public int SlotIndex { get; set; }
    public int Quantity { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }

    /// <summary>
    /// JSON-serialized array of augment strings decoded from the item's extdata.
    /// Null when the item has no augments.
    /// </summary>
    public string? AugmentsJson { get; set; }

    public Character Character { get; set; } = null!;
}
