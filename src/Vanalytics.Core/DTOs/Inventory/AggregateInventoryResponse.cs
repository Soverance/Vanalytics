namespace Vanalytics.Core.DTOs.Inventory;

public class AggregateInventoryResponse
{
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
