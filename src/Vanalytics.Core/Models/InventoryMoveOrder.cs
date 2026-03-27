using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class InventoryMoveOrder
{
    public long Id { get; set; }
    public Guid CharacterId { get; set; }
    public int ItemId { get; set; }
    public InventoryBag FromBag { get; set; }
    public int FromSlot { get; set; }
    public InventoryBag ToBag { get; set; }
    public int Quantity { get; set; }
    public MoveOrderStatus Status { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }

    public Character Character { get; set; } = null!;
}
