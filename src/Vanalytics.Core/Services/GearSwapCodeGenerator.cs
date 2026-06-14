// src/Vanalytics.Core/Services/GearSwapCodeGenerator.cs
using System.Text;

namespace Vanalytics.Core.Services;

public static partial class GearSwapCodeGenerator
{
    // Internal grid slot -> GearSwap key, canonical equip order. Mirrors gearSwapExport.ts.
    private static readonly (string Grid, string Key)[] SlotMap =
    [
        ("Main","main"), ("Sub","sub"), ("Range","range"), ("Ammo","ammo"),
        ("Head","head"), ("Neck","neck"), ("Ear1","left_ear"), ("Ear2","right_ear"),
        ("Body","body"), ("Hands","hands"), ("Ring1","left_ring"), ("Ring2","right_ring"),
        ("Back","back"), ("Waist","waist"), ("Legs","legs"), ("Feet","feet"),
    ];

    private static string SlotValue(ResolvedSlot slot)
    {
        if (slot.Augments.Count == 0) return GearSwapLua.Name(slot.ItemName);
        var augs = string.Join(",", slot.Augments.Select(GearSwapLua.Augment)) + ",";
        return $"{{ name={GearSwapLua.Name(slot.ItemName)}, augments={{{augs}}}}}";
    }

    /// <summary>Emits the body of get_sets(): one `sets['Name'] = { ... }` block per distinct set.</summary>
    public static string EmitSets(IEnumerable<ResolvedGearSet> sets)
    {
        var sb = new StringBuilder();
        var seen = new HashSet<long>();
        foreach (var set in sets)
        {
            if (!seen.Add(set.Id)) continue;
            sb.Append($"    sets[{GearSwapLua.Key(set.Name)}] = {{\n");
            var bySlot = set.Slots.ToDictionary(s => s.Slot);
            foreach (var (grid, key) in SlotMap)
            {
                if (!bySlot.TryGetValue(grid, out var s) || s.ItemId == 0 || string.IsNullOrEmpty(s.ItemName))
                    continue;
                sb.Append($"        {key}={SlotValue(s)},\n");
            }
            sb.Append("    }\n");
        }
        return sb.ToString();
    }
}
