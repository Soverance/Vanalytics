// src/Vanalytics.Core/Services/GearSwapCodeGenerator.Events.cs
using System.Text;
using Vanalytics.Core.DTOs.Blueprints;

namespace Vanalytics.Core.Services;

public static partial class GearSwapCodeGenerator
{
    // Per trigger node type: function signature + per-branch (Lua guard, dispatch). `Dispatch` is the
    // Lua expression a category branch switches on (e.g. "spell.english", "buff"); null = a terminal
    // branch that flat-equips.
    private sealed record TriggerSpec(string Signature, (string Handle, string Cond, string? Dispatch)[] Branches);

    private static readonly Dictionary<string, TriggerSpec> Triggers = new()
    {
        ["trigger:status_change"] = new("function status_change(new, old)",
        [
            ("Engaged", "new == 'Engaged'", null),
            ("Idle",    "new == 'Idle'",    null),
            ("Resting", "new == 'Resting'", null),
        ]),
        ["trigger:precast"] = new("function precast(spell)",
        [
            ("WeaponSkill", "spell.type == 'WeaponSkill'",  "spell.english"),
            ("JobAbility",  "spell.type == 'JobAbility'",   "spell.english"),
            ("Magic",       "spell.action_type == 'Magic'", "spell.english"),
        ]),
        ["trigger:aftercast"] = new("function aftercast(spell)",
        [
            ("Engaged", "player.status == 'Engaged'", null),
            ("Idle",    "player.status ~= 'Engaged'", null),
        ]),
        ["trigger:midcast"] = new("function midcast(spell)",
        [
            ("Magic",  "spell.action_type == 'Magic'",         "spell.english"),  // category
            ("Ranged", "spell.action_type == 'Ranged Attack'", null),             // terminal, flat equip
        ]),
        ["trigger:buff_change"] = new("function buff_change(buff, gain)",
        [
            ("Gained", "gain",     "buff"),   // category, dispatch on buff name
            ("Lost",   "not gain", "buff"),   // category, dispatch on buff name
        ]),
    };

    /// <summary>
    /// Emits the event functions. For each trigger node, walks its branch pins in spec order; a pin
    /// with at least one resolvable leaf contributes an if/elseif arm. Terminal pins equip flat;
    /// category (precast) pins dispatch on spell.english (named leaves) with the generic leaf as else.
    /// </summary>
    public static string EmitEvents(BlueprintGraphDto graph, IReadOnlyDictionary<long, string> setNamesById)
    {
        var sb = new StringBuilder();
        var equipById = graph.Nodes.Where(n => n.Type == "equip").ToDictionary(n => n.Id);
        // Mode nodes are valid targets for terminal pins: nodeId -> Lua namespace (only non-empty modes).
        var modeNsById = CollectModes(graph, setNamesById).ToDictionary(m => m.NodeId, m => m.Namespace);

        foreach (var node in graph.Nodes)
        {
            if (!Triggers.TryGetValue(node.Type, out var spec)) continue;

            var arms = new List<(string Cond, string Body)>();
            foreach (var (handle, cond, dispatch) in spec.Branches)
            {
                var targetIds = graph.Edges
                    .Where(e => e.Source == node.Id && e.SourceHandle == handle)
                    .Select(e => e.Target)
                    .ToList();
                if (targetIds.Count == 0) continue;

                string? body;
                if (dispatch is null)
                {
                    body = TerminalBody(targetIds, equipById, modeNsById, setNamesById);
                }
                else
                {
                    var leaves = targetIds
                        .Select(t => equipById.TryGetValue(t, out var n) ? n : null)
                        .Where(n => n is not null).Select(n => n!)
                        .ToList();
                    body = leaves.Count == 0 ? null : NestedBody(dispatch, leaves, setNamesById);
                }
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

    private static string? Resolve(BlueprintNodeDto leaf, IReadOnlyDictionary<long, string> names) =>
        leaf.Data.GearSetId is { } id && names.TryGetValue(id, out var name) ? name : null;

    // Terminal pin: first resolvable target wins, inline after `then`. An equip leaf -> flat
    // sets['Name']; a mode node -> equip of the mode's current set.
    private static string? TerminalBody(
        List<string> targetIds,
        IReadOnlyDictionary<string, BlueprintNodeDto> equipById,
        IReadOnlyDictionary<string, string> modeNsById,
        IReadOnlyDictionary<long, string> names)
    {
        foreach (var id in targetIds)
        {
            if (modeNsById.TryGetValue(id, out var ns))
                return $" equip(sets.{ns}[{ns}_Set_Names[{ns}_Index]])";
            if (equipById.TryGetValue(id, out var leaf))
            {
                var name = Resolve(leaf, names);
                if (name is not null) return $" equip(sets[{GearSwapLua.Key(name)}])";
            }
        }
        return null;
    }

    // Category pin: dispatch on <dispatch> (e.g. spell.english, buff). Named leaves -> if/elseif chain;
    // generic (no actionName) -> trailing else. Only-generic collapses to an inline equip. Null if
    // nothing resolves.
    private static string? NestedBody(string dispatch, List<BlueprintNodeDto> leaves, IReadOnlyDictionary<long, string> names)
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
            inner.Append($"        {kw} {dispatch} == {GearSwapLua.Key(named[i].Action)} then equip(sets[{GearSwapLua.Key(named[i].Set)}])\n");
        }
        if (genericSet is not null)
            inner.Append($"        else equip(sets[{GearSwapLua.Key(genericSet)}])\n");
        inner.Append("        end");
        return inner.ToString();
    }
}
