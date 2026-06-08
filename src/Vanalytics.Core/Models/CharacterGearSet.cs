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

    /// <summary>
    /// JSON-serialized array of slot snapshots: [{ "slot": "Legs", "itemId": 27932,
    /// "augments": ["Enhances \"Feint\" effect"] }]. Self-contained; not linked to a live
    /// item instance. Empty slots are omitted from the array.
    /// </summary>
    public string SlotsJson { get; set; } = "[]";

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public Character Character { get; set; } = null!;
}
