namespace Vanalytics.Core.Models;

public class GameItem
{
    public int ItemId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? NameJa { get; set; }
    public string? NameLong { get; set; }
    public string? Description { get; set; }
    public string? DescriptionJa { get; set; }
    public string Category { get; set; } = string.Empty;
    public int Type { get; set; }
    public int Flags { get; set; }
    public int StackSize { get; set; } = 1;
    public int? Level { get; set; }
    public int? Jobs { get; set; }
    public int? Races { get; set; }
    public int? Slots { get; set; }
    public int? Skill { get; set; }
    public int? Damage { get; set; }
    public int? Delay { get; set; }
    public int? DEF { get; set; }
    public int? HP { get; set; }
    public int? MP { get; set; }
    public int? STR { get; set; }
    public int? DEX { get; set; }
    public int? VIT { get; set; }
    public int? AGI { get; set; }
    public int? INT { get; set; }
    public int? MND { get; set; }
    public int? CHR { get; set; }
    public int? Accuracy { get; set; }
    public int? Attack { get; set; }
    public int? RangedAccuracy { get; set; }
    public int? RangedAttack { get; set; }
    public int? MagicAccuracy { get; set; }
    public int? MagicDamage { get; set; }
    public int? MagicEvasion { get; set; }
    public int? Evasion { get; set; }
    public int? Enmity { get; set; }
    public int? Haste { get; set; }
    public int? StoreTP { get; set; }
    public int? TPBonus { get; set; }
    public int? PhysicalDamageTaken { get; set; }
    public int? MagicDamageTaken { get; set; }
    public string? IconPath { get; set; }
    public string? PreviewImagePath { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public bool IsRare => (Flags & 32) != 0;
    public bool IsExclusive => (Flags & 8192) != 0;
    public bool IsAuctionable => (Flags & 32768) != 0;
}
