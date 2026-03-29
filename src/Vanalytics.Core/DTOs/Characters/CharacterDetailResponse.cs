namespace Vanalytics.Core.DTOs.Characters;

public class CharacterDetailResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Server { get; set; } = string.Empty;
    public bool IsPublic { get; set; }
    public DateTimeOffset? LastSyncAt { get; set; }
    public string? Race { get; set; }
    public string? Gender { get; set; }
    public int? FaceModelId { get; set; }
    public string? SubJob { get; set; }
    public int? SubJobLevel { get; set; }
    public int? MasterLevel { get; set; }
    public int? ItemLevel { get; set; }
    public int? Hp { get; set; }
    public int? MaxHp { get; set; }
    public int? Mp { get; set; }
    public int? MaxMp { get; set; }
    public string? Linkshell { get; set; }
    public int? Nation { get; set; }
    public int? TitleId { get; set; }
    public string? Title { get; set; }
    public Dictionary<string, int>? Merits { get; set; }
    public FavoriteAnimationDto? FavoriteAnimation { get; set; }

    public List<JobEntry> Jobs { get; set; } = [];
    public List<GearEntry> Gear { get; set; } = [];
    public List<CraftingEntry> CraftingSkills { get; set; } = [];
}

public class JobEntry
{
    public string Job { get; set; } = string.Empty;
    public int Level { get; set; }
    public bool IsActive { get; set; }
    public int JP { get; set; }
    public int JPSpent { get; set; }
    public int CP { get; set; }
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

public class FavoriteAnimationDto
{
    public string Category { get; set; } = string.Empty;
    public string AnimationName { get; set; } = string.Empty;
    public int MotionIndex { get; set; }
}
