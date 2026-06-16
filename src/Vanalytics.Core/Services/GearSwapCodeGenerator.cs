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
    /// The Lua expression to equip a target made of a base set plus optional override layers:
    /// <c>sets['Only']</c> for one resolvable set, <c>set_combine(sets['A'], sets['B'], …)</c> for two or
    /// more (base first, right-most wins), or null if nothing resolves. Unresolved (deleted) ids are
    /// dropped — a target whose overlays all vanish degrades to a plain equip of its base.
    /// </summary>
    public static string? EquipExpr(long? baseId, IReadOnlyList<long>? overlayIds, IReadOnlyDictionary<long, string> names)
    {
        var ids = new List<long>();
        if (baseId is { } b) ids.Add(b);
        if (overlayIds is not null) ids.AddRange(overlayIds);
        var parts = ids.Where(names.ContainsKey).Select(id => $"sets[{GearSwapLua.Key(names[id])}]").ToList();
        return parts.Count switch { 0 => null, 1 => parts[0], _ => $"set_combine({string.Join(", ", parts)})" };
    }
}
