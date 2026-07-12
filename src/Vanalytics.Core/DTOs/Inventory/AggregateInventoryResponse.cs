namespace Vanalytics.Core.DTOs.Inventory;

public class AggregateInventoryResponse
{
    public string? World { get; set; }
    public bool ServerScraped { get; set; }
    public List<string> AvailableWorlds { get; set; } = [];
    public AggregateInventoryTotals Totals { get; set; } = new();
    public List<AggregateInventoryItem> Items { get; set; } = [];
    public List<AggregateInventoryCharacter> Characters { get; set; } = [];
}

public class AggregateInventoryTotals
{
    public int CharacterCount { get; set; }
    public int SyncedCharacterCount { get; set; }
    public int DistinctItems { get; set; }
    public long TotalQuantity { get; set; }
    public int UsedSlots { get; set; }
    public int UnlockedSlots { get; set; }
}

public class AggregateInventoryItem
{
    public int ItemId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? IconPath { get; set; }
    public int StackSize { get; set; }
    public long TotalQuantity { get; set; }
    public bool IsRare { get; set; }
    public bool IsExclusive { get; set; }
    public bool IsNoDelivery { get; set; }
    public bool IsNoAuction { get; set; }
    public int? BaseSell { get; set; }
    public int? SingleMedian { get; set; }
    public int SingleCount { get; set; }
    public int? StackMedian { get; set; }
    public int StackCount { get; set; }
    public DateTimeOffset? LastSoldAt { get; set; }
    public List<AggregateInventoryLocation> Locations { get; set; } = [];
}

public class AggregateInventoryLocation
{
    public Guid CharacterId { get; set; }
    public string CharacterName { get; set; } = string.Empty;
    public string Role { get; set; } = "None";
    public string Bag { get; set; } = string.Empty;
    public int Quantity { get; set; }
}

public class AggregateInventoryCharacter
{
    public Guid CharacterId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Role { get; set; } = "None";
    public DateTimeOffset? LastSyncAt { get; set; }
}
