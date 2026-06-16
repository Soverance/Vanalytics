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
            sb.Append(EmitSlots(set));
            sb.Append("    }\n");
        }
        return sb.ToString();
    }

    /// <summary>Emits the indented `slot=value,` lines for one set's populated slots, in canonical order.</summary>
    internal static string EmitSlots(ResolvedGearSet set)
    {
        var sb = new StringBuilder();
        var bySlot = set.Slots.ToDictionary(s => s.Slot);
        foreach (var (grid, key) in SlotMap)
        {
            if (!bySlot.TryGetValue(grid, out var s) || s.ItemId == 0 || string.IsNullOrEmpty(s.ItemName))
                continue;
            sb.Append($"        {key}={SlotValue(s)},\n");
        }
        return sb.ToString();
    }

    /// <summary>
    /// Lua expression for a combine reference: <c>set_combine(sets['A'], sets['B'], …)</c>, components in
    /// list order so the right-most wins (matching GearSwap's right-most-wins set_combine). Components
    /// whose name is unknown (deleted set) are dropped. Returns null if fewer than 2 resolve — a combine
    /// of &lt;2 sets is meaningless and the caller skips it.
    /// </summary>
    public static string? CombineExpr(IReadOnlyList<long> componentIds, IReadOnlyDictionary<long, string> names)
    {
        var parts = componentIds
            .Where(names.ContainsKey)
            .Select(id => $"sets[{GearSwapLua.Key(names[id])}]")
            .ToList();
        return parts.Count < 2 ? null : $"set_combine({string.Join(", ", parts)})";
    }
}
