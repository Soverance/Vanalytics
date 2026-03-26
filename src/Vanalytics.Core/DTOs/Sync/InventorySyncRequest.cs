using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Sync;

public class InventorySyncRequest
{
    [Required, MaxLength(64)]
    public string CharacterName { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Server { get; set; } = string.Empty;

    [Required]
    public List<InventoryChangeEntry> Changes { get; set; } = [];
}

public class InventoryChangeEntry
{
    public int ItemId { get; set; }

    [Required]
    public string Bag { get; set; } = string.Empty;

    public int SlotIndex { get; set; }

    [Required]
    public string ChangeType { get; set; } = string.Empty;

    public int QuantityBefore { get; set; }
    public int QuantityAfter { get; set; }
}
