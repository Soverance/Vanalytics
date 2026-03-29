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
    public int? NationRank { get; set; }
    public int? RankPoints { get; set; }
    public int? TitleId { get; set; }
    public string? Title { get; set; }
    // Base stats (from packet 0x061)
    public int? BaseStr { get; set; }
    public int? BaseDex { get; set; }
    public int? BaseVit { get; set; }
    public int? BaseAgi { get; set; }
    public int? BaseInt { get; set; }
    public int? BaseMnd { get; set; }
    public int? BaseChr { get; set; }

    // Added stats from gear/buffs (from packet 0x061)
    public int? AddedStr { get; set; }
    public int? AddedDex { get; set; }
    public int? AddedVit { get; set; }
    public int? AddedAgi { get; set; }
    public int? AddedInt { get; set; }
    public int? AddedMnd { get; set; }
    public int? AddedChr { get; set; }

    // Combat stats (from packet 0x061)
    public int? Attack { get; set; }
    public int? Defense { get; set; }

    // Elemental resistances (from packet 0x061)
    public int? ResFire { get; set; }
    public int? ResIce { get; set; }
    public int? ResWind { get; set; }
    public int? ResEarth { get; set; }
    public int? ResLightning { get; set; }
    public int? ResWater { get; set; }
    public int? ResLight { get; set; }
    public int? ResDark { get; set; }

    public int? PlaytimeSeconds { get; set; }

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
