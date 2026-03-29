using Soverance.Auth.Models;
using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class Character
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Server { get; set; } = string.Empty;
    public bool IsPublic { get; set; }
    public Race? Race { get; set; }
    public Gender? Gender { get; set; }
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
    // Base stats (from packet 0x061 - server-authoritative)
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

    // Playtime in seconds (from packet 0x00A)
    public int? PlaytimeSeconds { get; set; }

    public string? MeritsJson { get; set; }
    public string? FavoriteAnimationJson { get; set; }
    public DateTimeOffset? LastSyncAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public User User { get; set; } = null!;
    public List<CharacterJob> Jobs { get; set; } = [];
    public List<EquippedGear> Gear { get; set; } = [];
    public List<CraftingSkill> CraftingSkills { get; set; } = [];
    public List<MacroBook> MacroBooks { get; set; } = [];
}
