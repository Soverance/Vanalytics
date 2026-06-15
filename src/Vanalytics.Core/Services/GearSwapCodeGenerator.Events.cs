// src/Vanalytics.Core/Services/GearSwapCodeGenerator.Events.cs
using System.Text;
using Vanalytics.Core.DTOs.Workflows;

namespace Vanalytics.Core.Services;

public static partial class GearSwapCodeGenerator
{
    // Per trigger node type: function signature + per-branch Lua guard. `Nested` = the branch
    // dispatches further on spell.english (precast category pins); otherwise a flat equip.
    private sealed record TriggerSpec(string Signature, bool Nested, (string Handle, string Cond)[] Branches);

    private static readonly Dictionary<string, TriggerSpec> Triggers = new()
    {
        ["trigger:status_change"] = new("function status_change(new, old)", false,
        [
            ("Engaged", "new == 'Engaged'"),
            ("Idle",    "new == 'Idle'"),
            ("Resting", "new == 'Resting'"),
        ]),
        ["trigger:precast"] = new("function precast(spell)", true,
        [
            ("WeaponSkill", "spell.type == 'WeaponSkill'"),
            ("JobAbility",  "spell.type == 'JobAbility'"),
            ("Magic",       "spell.action_type == 'Magic'"),
        ]),
        ["trigger:aftercast"] = new("function aftercast(spell)", false,
        [
            ("Engaged", "player.status == 'Engaged'"),
            ("Idle",    "player.status ~= 'Engaged'"),
        ]),
    };

    /// <summary>
    /// Emits the event functions. For each trigger node, walks its branch pins in spec order; a pin
    /// with at least one resolvable leaf contributes an if/elseif arm. Terminal pins equip flat;
    /// category (precast) pins dispatch on spell.english (named leaves) with the generic leaf as else.
    /// </summary>
    public static string EmitEvents(WorkflowGraphDto graph, IReadOnlyDictionary<long, string> setNamesById)
    {
        var sb = new StringBuilder();
        var equipById = graph.Nodes.Where(n => n.Type == "equip").ToDictionary(n => n.Id);

        foreach (var node in graph.Nodes)
        {
            if (!Triggers.TryGetValue(node.Type, out var spec)) continue;

            var arms = new List<(string Cond, string Body)>();
            foreach (var (handle, cond) in spec.Branches)
            {
                var leaves = graph.Edges
                    .Where(e => e.Source == node.Id && e.SourceHandle == handle)
                    .Select(e => equipById.TryGetValue(e.Target, out var t) ? t : null)
                    .Where(t => t is not null).Select(t => t!)
                    .ToList();
                if (leaves.Count == 0) continue;

                var body = spec.Nested ? NestedBody(leaves, setNamesById) : FlatBody(leaves, setNamesById);
                if (body is null) continue;
                arms.Add((cond, body));
            }
            if (arms.Count == 0) continue;

            sb.Append(spec.Signature).Append('\n');
            for (var i = 0; i < arms.Count; i++)
            {
                var kw = i == 0 ? "if" : "elseif";
                sb.Append($"    {kw} {arms[i].Cond} then{arms[i].Body}\n");
            }
            sb.Append("    end\n");
            sb.Append("end\n\n");
        }
        return sb.ToString();
    }

    private static string? Resolve(WorkflowNodeDto leaf, IReadOnlyDictionary<long, string> names) =>
        leaf.Data.GearSetId is { } id && names.TryGetValue(id, out var name) ? name : null;

    // Terminal pin: first resolvable leaf, inline after `then`.
    private static string? FlatBody(List<WorkflowNodeDto> leaves, IReadOnlyDictionary<long, string> names)
    {
        foreach (var leaf in leaves)
        {
            var name = Resolve(leaf, names);
            if (name is not null) return $" equip(sets[{GearSwapLua.Key(name)}])";
        }
        return null;
    }

    // Category pin: dispatch on spell.english. Named leaves -> if/elseif chain; generic (no actionName)
    // -> trailing else. Only-generic collapses to an inline equip (no nesting). Null if nothing resolves.
    private static string? NestedBody(List<WorkflowNodeDto> leaves, IReadOnlyDictionary<long, string> names)
    {
        var named = leaves
            .Where(l => !string.IsNullOrEmpty(l.Data.ActionName))
            .Select(l => (Action: l.Data.ActionName!, Set: Resolve(l, names)))
            .Where(x => x.Set is not null)
            .Select(x => (x.Action, Set: x.Set!))
            .ToList();
        var generic = leaves.FirstOrDefault(l => string.IsNullOrEmpty(l.Data.ActionName));
        var genericSet = generic is null ? null : Resolve(generic, names);

        if (named.Count == 0)
            return genericSet is null ? null : $" equip(sets[{GearSwapLua.Key(genericSet)}])";

        var inner = new StringBuilder("\n");
        for (var i = 0; i < named.Count; i++)
        {
            var kw = i == 0 ? "if" : "elseif";
            inner.Append($"        {kw} spell.english == {GearSwapLua.Key(named[i].Action)} then equip(sets[{GearSwapLua.Key(named[i].Set)}])\n");
        }
        if (genericSet is not null)
            inner.Append($"        else equip(sets[{GearSwapLua.Key(genericSet)}])\n");
        inner.Append("        end");
        return inner.ToString();
    }
}
