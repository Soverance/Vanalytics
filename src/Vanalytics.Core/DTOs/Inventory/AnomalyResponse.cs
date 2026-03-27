using Vanalytics.Core.Enums;

namespace Vanalytics.Core.DTOs.Inventory;

public class AnomalyResponse
{
    public List<Anomaly> Anomalies { get; set; } = [];
    public int DismissedCount { get; set; }
    public List<string> DismissedKeys { get; set; } = [];
    public List<MoveOrderResponse> PendingMoves { get; set; } = [];
}

public class Anomaly
{
    public string Type { get; set; } = string.Empty;
    public string Severity { get; set; } = "info";
    public string AnomalyKey { get; set; } = string.Empty;
    public int? ItemId { get; set; }
    public string? ItemName { get; set; }
    public List<string> Bags { get; set; } = [];
    public AnomalyDetails Details { get; set; } = new();
    public SuggestedFix? SuggestedFix { get; set; }
}

public class AnomalyDetails
{
    public List<SlotInfo>? Slots { get; set; }
    public string? BagName { get; set; }
    public int? UsedSlots { get; set; }
    public int? MaxSlots { get; set; }
}

public class SlotInfo
{
    public string Bag { get; set; } = string.Empty;
    public int SlotIndex { get; set; }
    public int Quantity { get; set; }
}

public class SuggestedFix
{
    public List<MoveInstruction> Moves { get; set; } = [];
}

public class MoveInstruction
{
    public int ItemId { get; set; }
    public string FromBag { get; set; } = string.Empty;
    public int FromSlot { get; set; }
    public string ToBag { get; set; } = string.Empty;
    public int Quantity { get; set; }
}

public class MoveOrderResponse
{
    public long Id { get; set; }
    public int ItemId { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public string FromBag { get; set; } = string.Empty;
    public int FromSlot { get; set; }
    public string ToBag { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}

public class DismissRequest
{
    public string AnomalyKey { get; set; } = string.Empty;
}

public class CreateMovesRequest
{
    public List<MoveInstruction> Moves { get; set; } = [];
}
