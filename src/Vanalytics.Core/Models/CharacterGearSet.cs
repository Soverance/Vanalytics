namespace Vanalytics.Core.Models;

public class CharacterGearSet
{
    public long Id { get; set; }
    public Guid CharacterId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Job { get; set; }

    /// <summary>GearSwap-faithful category (enum name from <see cref="Enums.GearSetCategory"/>),
    /// e.g. "WeaponSkill". Defaults to "Other" for sets created before categorization.</summary>
    public string Category { get; set; } = "Other";

    /// <summary>JSON-serialized array of free-form tags, e.g. ["SATA","BiS"]. Vanalytics-only
    /// organizational layer; never emitted to GearSwap Lua.</summary>
    public string TagsJson { get; set; } = "[]";

    /// <summary>Occupied slots of this set. Empty slots are simply absent. Replaces SlotsJson.</summary>
    public ICollection<GearSetSlot> Slots { get; set; } = new List<GearSetSlot>();

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public Character Character { get; set; } = null!;
}
