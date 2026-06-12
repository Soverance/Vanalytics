namespace Vanalytics.Core.Enums;

// Mirrors the GearSwap top-level set tables. The enum NAME is persisted on
// CharacterGearSet.Category and maps 1:1 to a GearSwap namespace for the future
// Lua codegen (e.g. WeaponSkill -> sets.WS, JobAbility -> sets.JA).
public enum GearSetCategory
{
    Idle,
    Engaged,
    WeaponSkill,
    JobAbility,
    Precast,
    Midcast,
    Aftercast,
    Weapons,
    Other,
}
