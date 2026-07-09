// src/Vanalytics.Core/Services/GearSwapCodeGenerator.BluCategory.cs
using System.Text;
using Vanalytics.Core.DTOs.Blueprints;

namespace Vanalytics.Core.Services;

public static partial class GearSwapCodeGenerator
{
    // Deterministic Lua-identifier slug for a BLU bucket label, e.g.
    // "Physical (STR)" -> "physical_str", "Unbridled (Learning)" -> "unbridled_learning".
    // Bucket labels are controlled (see SPELL_BLU_CATEGORIES) so distinct labels never collide.
    internal static string BluCategorySlug(string label)
    {
        var sb = new StringBuilder(label.Length);
        foreach (var ch in label.ToLowerInvariant())
            sb.Append(char.IsLetterOrDigit(ch) ? ch : '_');
        return sb.ToString().Trim('_').Replace("__", "_");
    }

    // One `local blu_cat_<slug> = { ['Name']=true, ... }` per distinct bluCategory bucket referenced
    // by a spell condition. Emitted before get_sets() so the event functions close over the locals.
    // Returns "" when the graph uses no BLU categories. Spell names are escaped via GearSwapLua.Key.
    internal static string EmitBluCategoryTables(BlueprintGraphDto graph)
    {
        var buckets = graph.Nodes
            .Where(n => n.Type == "spell" && n.Data.SpellField == "bluCategory"
                        && !string.IsNullOrWhiteSpace(n.Data.SpellValue)
                        && n.Data.SpellNames is { Count: > 0 })
            .GroupBy(n => n.Data.SpellValue!)
            .Select(g => (Label: g.Key, Names: g.First().Data.SpellNames!))
            .OrderBy(b => b.Label, StringComparer.Ordinal)
            .ToList();
        if (buckets.Count == 0) return string.Empty;

        var sb = new StringBuilder();
        foreach (var (label, names) in buckets)
        {
            var entries = string.Join(", ", names.Select(name => $"[{GearSwapLua.Key(name)}]=true"));
            sb.Append($"local blu_cat_{BluCategorySlug(label)} = {{ {entries} }}\n");
        }
        sb.Append('\n');
        return sb.ToString();
    }
}
