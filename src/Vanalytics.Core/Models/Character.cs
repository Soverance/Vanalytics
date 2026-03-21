using Soverance.Auth.Models;
using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class Character
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Server { get; set; } = string.Empty;
    public LicenseStatus LicenseStatus { get; set; } = LicenseStatus.Unlicensed;
    public bool IsPublic { get; set; }
    public DateTimeOffset? LastSyncAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public User User { get; set; } = null!;
    public List<CharacterJob> Jobs { get; set; } = [];
    public List<EquippedGear> Gear { get; set; } = [];
    public List<CraftingSkill> CraftingSkills { get; set; } = [];
}
