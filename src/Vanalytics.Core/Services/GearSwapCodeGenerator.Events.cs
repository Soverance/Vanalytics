// src/Vanalytics.Core/Services/GearSwapCodeGenerator.Events.cs
using System.Text;
using Vanalytics.Core.DTOs.Workflows;

namespace Vanalytics.Core.Services;

public static partial class GearSwapCodeGenerator
{
    // For each trigger node type: the GearSwap function signature and, per branch handle,
    // the Lua condition guard. Order of handles defines the if/elseif order.
    private sealed record TriggerSpec(string FnName, string Signature, (string Handle, string Cond)[] Branches);

    private static readonly Dictionary<string, TriggerSpec> Triggers = new()
    {
        ["trigger:status_change"] = new("status_change", "function status_change(new, old)",
        [
            ("Engaged", "new == 'Engaged'"),
            ("Idle",    "new == 'Idle'"),
            ("Resting", "new == 'Resting'"),
        ]),
        ["trigger:precast"] = new("precast", "function precast(spell)",
        [
            ("WeaponSkill", "spell.type == 'WeaponSkill'"),
            ("JobAbility",  "spell.type == 'JobAbility'"),
            ("Magic",       "spell.action_type == 'Magic'"),
        ]),
        ["trigger:aftercast"] = new("aftercast", "function aftercast(spell)",
        [
            ("Engaged", "player.status == 'Engaged'"),
            ("Idle",    "player.status ~= 'Engaged'"),
        ]),
    };

    /// <summary>
    /// Emits the event functions by walking the graph generically. For each trigger node, for each
    /// of its branch handles that is wired to an equip node with a resolvable set, emit an
    /// if/elseif guard + equip(). Triggers with no wired branches emit nothing.
    /// </summary>
    public static string EmitEvents(WorkflowGraphDto graph, IReadOnlyDictionary<long, string> setNamesById)
    {
        var sb = new StringBuilder();
        var equipById = graph.Nodes.Where(n => n.Type == "equip").ToDictionary(n => n.Id);

        foreach (var node in graph.Nodes)
        {
            if (!Triggers.TryGetValue(node.Type, out var spec)) continue;

            // Collect wired branches in spec order: handle -> set name.
            var branches = new List<(string Cond, string SetName)>();
            foreach (var (handle, cond) in spec.Branches)
            {
                var edge = graph.Edges.FirstOrDefault(e => e.Source == node.Id && e.SourceHandle == handle);
                if (edge is null) continue;
                if (!equipById.TryGetValue(edge.Target, out var target)) continue;
                var setId = target.Data.GearSetId;
                if (setId is null || !setNamesById.TryGetValue(setId.Value, out var name)) continue;
                branches.Add((cond, name));
            }
            if (branches.Count == 0) continue;

            sb.Append(spec.Signature).Append('\n');
            for (var i = 0; i < branches.Count; i++)
            {
                var kw = i == 0 ? "if" : "elseif";
                sb.Append($"    {kw} {branches[i].Cond} then equip(sets[{GearSwapLua.Key(branches[i].SetName)}])\n");
            }
            sb.Append("    end\n");
            sb.Append("end\n\n");
        }
        return sb.ToString();
    }
}
