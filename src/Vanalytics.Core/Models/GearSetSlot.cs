namespace Vanalytics.Core.Models;

/// <summary>
/// One occupied slot of a <see cref="CharacterGearSet"/>. Self-contained snapshot
/// (item + augments captured at save time), not linked to a live inventory instance.
/// Replaces the former CharacterGearSet.SlotsJson blob; ItemId is indexed for the
/// item-detail "In Gear Sets" reverse lookup.
/// </summary>
public class GearSetSlot
{
    public long Id { get; set; }
    public long GearSetId { get; set; }

    /// <summary>Internal grid slot name: Main, Sub, Range, Ammo, Head, Neck, Ear1, Ear2,
    /// Body, Hands, Ring1, Ring2, Back, Waist, Legs, Feet.</summary>
    public string Slot { get; set; } = string.Empty;

    public int ItemId { get; set; }

    /// <summary>Display/export name captured at pick time, so the GearSwap export emits the
    /// real item name even for items the character doesn't own.</summary>
    public string ItemName { get; set; } = string.Empty;

    /// <summary>JSON array of augment strings as captured at save; null when no augments.</summary>
    public string? AugmentsJson { get; set; }

    public CharacterGearSet GearSet { get; set; } = null!;
}
