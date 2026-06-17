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

    // The boolean Lua expression for a branch node, read from the cond:* node wired into its 'cond'
    // handle. Null if no condition is wired or its config is incomplete (branch then emits nothing).
    private static string? CondExprFor(ExecCtx ctx, string branchId)
    {
        var condId = ctx.Graph.Edges
            .FirstOrDefault(e => e.Target == branchId && e.TargetHandle == "cond")?.Source;
        if (condId is null || !ctx.ById.TryGetValue(condId, out var cond)) return null;
        switch (cond.Type)
        {
            case "cond:buff":
                var name = cond.Data.BuffName;
                if (string.IsNullOrWhiteSpace(name)) return null;
                // buffactive keys are the lowercased en (refresh.lua convert_buff_list). See
                // reference_gearswap_buff_representations.
                return $"buffactive[{GearSwapLua.Key(name.ToLowerInvariant())}]";
            case "cond:stat":
                if (string.IsNullOrWhiteSpace(cond.Data.Resource) ||
                    string.IsNullOrWhiteSpace(cond.Data.Op) || cond.Data.Value is null) return null;
                if (!StatResources.Contains(cond.Data.Resource) || !StatOps.Contains(cond.Data.Op)) return null;
                return $"player.{cond.Data.Resource} {cond.Data.Op} {cond.Data.Value}";
            default:
                return null;
        }
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
