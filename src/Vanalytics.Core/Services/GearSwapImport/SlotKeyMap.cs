namespace Vanalytics.Core.Services.GearSwapImport;

/// <summary>Inverse of GearSwapCodeGenerator.SlotMap: Lua slot key -> internal grid slot name.</summary>
public static class SlotKeyMap
{
    private static readonly Dictionary<string, string> Map = new(StringComparer.OrdinalIgnoreCase)
    {
        ["main"] = "Main", ["sub"] = "Sub", ["range"] = "Range", ["ammo"] = "Ammo",
        ["head"] = "Head", ["neck"] = "Neck", ["left_ear"] = "Ear1", ["right_ear"] = "Ear2",
        ["body"] = "Body", ["hands"] = "Hands", ["left_ring"] = "Ring1", ["right_ring"] = "Ring2",
        ["back"] = "Back", ["waist"] = "Waist", ["legs"] = "Legs", ["feet"] = "Feet",
    };

    public static bool TryToInternal(string luaKey, out string slot) => Map.TryGetValue(luaKey, out slot!);
}
