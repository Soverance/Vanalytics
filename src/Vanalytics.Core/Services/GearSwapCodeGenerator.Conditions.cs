// src/Vanalytics.Core/Services/GearSwapCodeGenerator.Conditions.cs
using Vanalytics.Core.DTOs.Blueprints;

namespace Vanalytics.Core.Services;

public static partial class GearSwapCodeGenerator
{
    private static readonly HashSet<string> StatResources = new() { "hp", "hpp", "mp", "mpp", "tp" };
    private static readonly HashSet<string> StatOps = new() { "<", "<=", ">", ">=", "==", "~=" };
    // Everything EmitExec needs to walk the exec graph, resolved once per EmitEvents call.
    private sealed record ExecCtx(
        BlueprintGraphDto Graph,
        IReadOnlyDictionary<string, BlueprintNodeDto> ById,
        IReadOnlyDictionary<long, string> Names,
        IReadOnlyDictionary<string, string> ModeNsById);

    // The single exec target wired from (sourceId, handle), or null. First wins.
    private static string? ExecTargetOf(ExecCtx ctx, string sourceId, string handle) =>
        ctx.Graph.Edges.FirstOrDefault(e => e.Source == sourceId && e.SourceHandle == handle)?.Target;

    // The boolean Lua expression feeding a branch's 'cond' handle, compiled from the node wired there
    // (buff | op:compare | op:and/or/not). Null if nothing is wired or the expression is incomplete —
    // the branch then emits nothing (EmitExec returns null).
    private static string? CondExprFor(ExecCtx ctx, string branchId)
    {
        var condId = ctx.Graph.Edges
            .FirstOrDefault(e => e.Target == branchId && e.TargetHandle == "cond")?.Source;
        return condId is null ? null : BoolExpr(ctx, condId, new HashSet<string>());
    }

    // Recursive boolean expression for a condition-subgraph node. `visited` is per-path (copied into
    // each child) so cycles are caught while a node may still feed two operator inputs (DAG reuse).
    private static string? BoolExpr(ExecCtx ctx, string nodeId, HashSet<string> visited)
    {
        if (!visited.Add(nodeId)) return null;
        if (!ctx.ById.TryGetValue(nodeId, out var n)) return null;
        switch (n.Type)
        {
            case "buff":
                var name = n.Data.BuffName;
                if (string.IsNullOrWhiteSpace(name)) return null;
                // buffactive keys are the lowercased en. See reference_gearswap_buff_representations.
                return $"buffactive[{GearSwapLua.Key(name.ToLowerInvariant())}]";

            case "op:compare":
                if (string.IsNullOrWhiteSpace(n.Data.Op) || n.Data.Value is null
                    || !StatOps.Contains(n.Data.Op)) return null;
                var wired = ctx.Graph.Edges
                    .FirstOrDefault(e => e.Target == nodeId && e.TargetHandle == "in")?.Source;
                var valueExpr = wired is not null ? NumExpr(ctx, wired, new HashSet<string>(visited)) : null;
                if (valueExpr is null)
                {
                    if (string.IsNullOrWhiteSpace(n.Data.Resource) || !StatResources.Contains(n.Data.Resource))
                        return null;
                    valueExpr = $"player.{n.Data.Resource}";
                }
                return $"{valueExpr} {n.Data.Op} {n.Data.Value}";

            case "spell":
                var sval = n.Data.SpellValue;
                if (string.IsNullOrWhiteSpace(sval)) return null;
                // Emitted verbatim — spell.english/skill/element compare against the resources' raw en,
                // so the value (from a res-sourced picker) is NOT lowercased. GearSwapLua.Key produces a
                // single-quoted, apostrophe-escaped Lua string literal.
                var slit = GearSwapLua.Key(sval);
                return n.Data.SpellField switch
                {
                    "name"    => $"spell.english == {slit}",
                    "skill"   => $"spell.skill == {slit}",
                    "element" => $"spell.element == {slit}",
                    _         => null,
                };

            case "op:and":
            case "op:or":
                var a = InBool(ctx, nodeId, "a", visited);
                var b = InBool(ctx, nodeId, "b", visited);
                if (a is null || b is null) return null;
                return $"({a} {(n.Type == "op:and" ? "and" : "or")} {b})";

            case "op:not":
                var x = InBool(ctx, nodeId, "in", visited);
                return x is null ? null : $"(not {x})";

            default:
                return null;
        }
    }

    // Boolean expression wired into (nodeId, handle), or null if nothing is wired there.
    private static string? InBool(ExecCtx ctx, string nodeId, string handle, HashSet<string> visited)
    {
        var src = ctx.Graph.Edges
            .FirstOrDefault(e => e.Target == nodeId && e.TargetHandle == handle)?.Source;
        return src is null ? null : BoolExpr(ctx, src, new HashSet<string>(visited));
    }

    // Numeric Lua expression for a value-source node feeding op:compare's 'in'. Null if unknown/invalid.
    private static string? NumExpr(ExecCtx ctx, string nodeId, HashSet<string> visited)
    {
        if (!visited.Add(nodeId)) return null;
        if (!ctx.ById.TryGetValue(nodeId, out var n)) return null;
        if (n.Type == "value")
        {
            if (string.IsNullOrWhiteSpace(n.Data.Resource) || !StatResources.Contains(n.Data.Resource))
                return null;
            return $"player.{n.Data.Resource}";
        }
        return null;
    }

    // Recursively emits the exec flow at <targetId> as indented Lua statements (4*indent leading
    // spaces, no leading/trailing newline). branch -> if/else; equip -> equip(...); mode -> equip
    // current. Null when nothing resolves (skip).
    private static string? EmitExec(ExecCtx ctx, string targetId, int indent, HashSet<string> visited)
    {
        if (!visited.Add(targetId)) return null;
        if (!ctx.ById.TryGetValue(targetId, out var node)) return null;
        var pad = new string(' ', indent * 4);

        if (node.Type == "branch")
        {
            var cond = CondExprFor(ctx, targetId);
            if (cond is null) return null;
            var tId = ExecTargetOf(ctx, targetId, "true");
            var fId = ExecTargetOf(ctx, targetId, "false");
            var tBody = tId is null ? null : EmitExec(ctx, tId, indent + 1, visited);
            var fBody = fId is null ? null : EmitExec(ctx, fId, indent + 1, visited);
            if (tBody is null && fBody is null) return null;
            var s = tBody is not null ? $"{pad}if {cond} then\n{tBody}\n" : $"{pad}if {cond} then\n";
            if (fBody is not null) s += $"{pad}else\n{fBody}\n";
            s += $"{pad}end";
            return s;
        }

        if (node.Type == "mode")
            return ctx.ModeNsById.TryGetValue(targetId, out var ns)
                ? $"{pad}equip(sets.{ns}[{ns}_Set_Names[{ns}_Index]])"
                : null;

        if (node.Type == "equip")
        {
            var expr = EquipExpr(node.Data.GearSetId, node.Data.OverlaySetIds, ctx.Names);
            return expr is null ? null : $"{pad}equip({expr})";
        }
        return null;
    }
}
