namespace Vanalytics.Core.DTOs.GearSets;

public class GearSetSlotDto
{
    /// <summary>Internal grid slot name: Main, Sub, Range, Ammo, Head, Neck, Ear1, Ear2,
    /// Body, Hands, Ring1, Ring2, Back, Waist, Legs, Feet.</summary>
    public string Slot { get; set; } = string.Empty;
    public int ItemId { get; set; }
    public List<string> Augments { get; set; } = [];
}
