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
        ["trigger:pet_change"] = new("function pet_change(pet, gain)",
        [
            ("Summoned", "gain",     null),   // terminal: a pet appeared
            ("Released", "not gain", null),   // terminal: pet left
        ]),
        ["trigger:pet_status_change"] = new("function pet_status_change(new, old)",
        [
            ("Engaged", "new == 'Engaged'", null),
            ("Idle",    "new == 'Idle'",    null),
        ]),
        ["trigger:pet_aftercast"] = new("function pet_aftercast(spell)",
        [
            ("Engaged", "player.status == 'Engaged'", null),
            ("Idle",    "player.status ~= 'Engaged'", null),
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

        var byId = graph.Nodes.ToDictionary(n => n.Id);
        var ctx = new ExecCtx(graph, byId, setNamesById, modeNsById);

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
                // A handle wired to a Branch node enters single-target recursive flow (flat leaves).
                var branchId = targetIds.FirstOrDefault(t => byId.TryGetValue(t, out var n) && n.Type == "branch");
                if (branchId is not null)
                {
                    var flow = EmitExec(ctx, branchId, 2, new HashSet<string>());
                    body = flow is null ? null : "\n" + flow;
                }
                else if (dispatch is null)
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
                var expr = EquipExpr(leaf.Data.GearSetId, leaf.Data.OverlaySetIds, names);
                if (expr is not null) return $" equip({expr})";
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
            .Select(l => (Action: l.Data.ActionName!, Expr: EquipExpr(l.Data.GearSetId, l.Data.OverlaySetIds, names)))
            .Where(x => x.Expr is not null)
            .Select(x => (x.Action, Expr: x.Expr!))
            .ToList();
        var generic = leaves.FirstOrDefault(l => string.IsNullOrEmpty(l.Data.ActionName));
        var genericExpr = generic is null ? null : EquipExpr(generic.Data.GearSetId, generic.Data.OverlaySetIds, names);

        if (named.Count == 0)
            return genericExpr is null ? null : $" equip({genericExpr})";

        var inner = new StringBuilder("\n");
        for (var i = 0; i < named.Count; i++)
        {
            var kw = i == 0 ? "if" : "elseif";
            inner.Append($"        {kw} {dispatch} == {GearSwapLua.Key(named[i].Action)} then equip({named[i].Expr})\n");
        }
        if (genericExpr is not null)
            inner.Append($"        else equip({genericExpr})\n");
        inner.Append("        end");
        return inner.ToString();
    }
}
