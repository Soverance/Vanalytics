using System.ComponentModel.DataAnnotations;

namespace Vanalytics.Core.DTOs.Sync;

public class SyncRequest
{
    [Required, MaxLength(64)]
    public string CharacterName { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string Server { get; set; } = string.Empty;

    [Required]
    public string ActiveJob { get; set; } = string.Empty;

    public int ActiveJobLevel { get; set; }

    public int? Race { get; set; }
    public List<SyncModelEntry> Models { get; set; } = [];

    public List<SyncJobEntry> Jobs { get; set; } = [];
    public List<SyncGearEntry> Gear { get; set; } = [];
    public List<SyncCraftingEntry> Crafting { get; set; } = [];
}

public class SyncJobEntry
{
    public string Job { get; set; } = string.Empty;
    public int Level { get; set; }
}

public class SyncGearEntry
{
    public string Slot { get; set; } = string.Empty;
    public int ItemId { get; set; }
    public string ItemName { get; set; } = string.Empty;
}

public class SyncCraftingEntry
{
    public string Craft { get; set; } = string.Empty;
    public int Level { get; set; }
    public string Rank { get; set; } = string.Empty;
}
