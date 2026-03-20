namespace Vanalytics.Core.DTOs.Characters;

public class CharacterDetailResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Server { get; set; } = string.Empty;
    public string LicenseStatus { get; set; } = string.Empty;
    public bool IsPublic { get; set; }
    public DateTimeOffset? LastSyncAt { get; set; }

    public List<JobEntry> Jobs { get; set; } = [];
    public List<GearEntry> Gear { get; set; } = [];
    public List<CraftingEntry> CraftingSkills { get; set; } = [];
}

public class JobEntry
{
    public string Job { get; set; } = string.Empty;
    public int Level { get; set; }
    public bool IsActive { get; set; }
}

public class GearEntry
{
    public string Slot { get; set; } = string.Empty;
    public int ItemId { get; set; }
    public string ItemName { get; set; } = string.Empty;
}

public class CraftingEntry
{
    public string Craft { get; set; } = string.Empty;
    public int Level { get; set; }
    public string Rank { get; set; } = string.Empty;
}
