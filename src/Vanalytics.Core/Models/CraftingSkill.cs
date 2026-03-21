using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

public class CraftingSkill
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public CraftType Craft { get; set; }
    public int Level { get; set; }
    public string Rank { get; set; } = string.Empty;

    public Character Character { get; set; } = null!;
}
