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
    public int? TitleId { get; set; }
    public string? Title { get; set; }
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
