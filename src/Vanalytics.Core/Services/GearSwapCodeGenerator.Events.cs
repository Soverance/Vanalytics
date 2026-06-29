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
        ["trigger:pet_midcast"] = new("function pet_midcast(spell)",
        [
            ("PetAction", "true", "spell.english"),   // lone guardless category pin (blood pacts / ready moves / automaton actions)
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

            // Guardless single-category trigger (pet_midcast): emit the dispatch as the function body
            // directly — no redundant `if true then … end`. Detected by a lone branch whose guard is "true".
            if (spec.Branches.Length == 1 && spec.Branches[0].Cond == "true")
            {
                var fnBody = GuardlessCategoryBody(ctx, node, spec.Branches[0], equipById, setNamesById);
                if (fnBody is null) continue;
                sb.Append(spec.Signature).Append('\n').Append(fnBody).Append('\n').Append("end\n\n");
                continue;
            }

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
                    // Inline fast path (byte-identical): a lone equip/mode terminal target with no 'out'
                    // chain keeps today's ` equip(...)` form. A lua/print target, or an equip/mode that
                    // chains, drops to the multi-line block form via EmitExec (same shape as a branch arm).
                    if (targetIds.Count == 1 && IsSimpleTerminal(ctx, targetIds[0]))
                    {
                        body = TerminalBody(targetIds, equipById, modeNsById, setNamesById);
                    }
                    else
                    {
                        // Single-target wiring: only targetIds[0] is followed (first-wins, same as ExecTargetOf).
                        var flow = EmitExec(ctx, targetIds[0], 2, new HashSet<string>());
                        body = flow is null ? null : "\n" + flow;
                    }
                }
                else
                {
                    var leaves = targetIds
                        .Select(t => equipById.TryGetValue(t, out var n) ? n : null)
                        .Where(n => n is not null).Select(n => n!)
                        .ToList();
                    body = leaves.Count == 0 ? null : NestedBody(ctx, dispatch, leaves, setNamesById);
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

    // A terminal pin can stay inline (today's ` equip(...)`) only when its target is a lone equip/mode
    // with no exec 'out' successor. lua/print targets, or a chained equip/mode, need the block form.
    private static bool IsSimpleTerminal(ExecCtx ctx, string nodeId)
    {
        if (!ctx.ById.TryGetValue(nodeId, out var n)) return false;
        if (n.Type != "equip" && n.Type != "mode") return false;
        return ExecTargetOf(ctx, nodeId, "out") is null;
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
    // generic (no actionName) -> trailing else. A named leaf that chains (exec 'out' wired) emits its
    // arm as a multi-line block via EmitExec instead of an inline equip, so the chain isn't dropped.
    // Only-generic collapses to an inline equip. Null if nothing resolves. `indentSpaces` is the chain
    // line indent (8 inside an `if cond then` wrapper, 4 as a guardless function body).
    private static string? NestedBody(ExecCtx ctx, string dispatch, List<BlueprintNodeDto> leaves, IReadOnlyDictionary<long, string> names, int indentSpaces = 8)
    {
        var pad = new string(' ', indentSpaces);
        var named = leaves.Where(l => !string.IsNullOrEmpty(l.Data.ActionName)).ToList();
        var generic = leaves.FirstOrDefault(l => string.IsNullOrEmpty(l.Data.ActionName));
        var genericExpr = generic is null ? null : EquipExpr(generic.Data.GearSetId, generic.Data.OverlaySetIds, names);

        // Build (action, renderer) pairs, dropping leaves whose own equip resolves to nothing AND that
        // don't chain to anything.
        var arms = new List<(string Action, bool Block, string Inline, string? BlockBody)>();
        foreach (var l in named)
        {
            var chains = ExecTargetOf(ctx, l.Id, "out") is not null;
            if (chains)
            {
                var flow = EmitExec(ctx, l.Id, indentSpaces / 4 + 1, new HashSet<string>());
                if (flow is not null) arms.Add((l.Data.ActionName!, true, "", flow));
            }
            else
            {
                var expr = EquipExpr(l.Data.GearSetId, l.Data.OverlaySetIds, names);
                if (expr is not null) arms.Add((l.Data.ActionName!, false, $"equip({expr})", null));
            }
        }

        if (arms.Count == 0)
            return genericExpr is null ? null : $" equip({genericExpr})";

        var inner = new StringBuilder("\n");
        for (var i = 0; i < arms.Count; i++)
        {
            var kw = i == 0 ? "if" : "elseif";
            if (arms[i].Block)
                inner.Append($"{pad}{kw} {dispatch} == {GearSwapLua.Key(arms[i].Action)} then\n{arms[i].BlockBody}\n");
            else
                inner.Append($"{pad}{kw} {dispatch} == {GearSwapLua.Key(arms[i].Action)} then {arms[i].Inline}\n");
        }
        if (genericExpr is not null)
            inner.Append($"{pad}else equip({genericExpr})\n");
        inner.Append($"{pad}end");
        return inner.ToString();
    }

    // A trigger with a single category pin and no meaningful guard (pet_midcast): emit its dispatch
    // directly as the function body, at function-body indent (4 spaces), with no `if true then … end`.
    // Returns null when nothing resolves (the function is then omitted entirely).
    private static string? GuardlessCategoryBody(
        ExecCtx ctx, BlueprintNodeDto node,
        (string Handle, string Cond, string? Dispatch) branch,
        IReadOnlyDictionary<string, BlueprintNodeDto> equipById,
        IReadOnlyDictionary<long, string> names)
    {
        var targetIds = ctx.Graph.Edges
            .Where(e => e.Source == node.Id && e.SourceHandle == branch.Handle)
            .Select(e => e.Target).ToList();
        if (targetIds.Count == 0) return null;

        // Wired to a Branch -> recurse at function-body depth (indent level 1 => 4 spaces).
        var branchId = targetIds.FirstOrDefault(t => ctx.ById.TryGetValue(t, out var n) && n.Type == "branch");
        if (branchId is not null)
            return EmitExec(ctx, branchId, 1, new HashSet<string>());

        var leaves = targetIds
            .Select(t => equipById.TryGetValue(t, out var n) ? n : null)
            .Where(n => n is not null).Select(n => n!)
            .ToList();
        if (leaves.Count == 0) return null;

        // Named leaves -> spell.english dispatch chain at 4-space indent.
        // NestedBody seeds a leading '\n' for the inline-after-`then` flow; at function-body level we
        // strip it so the dispatch starts on the line right after the signature.
        if (leaves.Any(l => !string.IsNullOrEmpty(l.Data.ActionName)))
            return NestedBody(ctx, branch.Dispatch!, leaves, names, 4)?.TrimStart('\n');

        // Generic-only -> flat equip at 4-space indent.
        var expr = EquipExpr(leaves[0].Data.GearSetId, leaves[0].Data.OverlaySetIds, names);
        return expr is null ? null : $"    equip({expr})";
    }
}
