// src/Vanalytics.Core/Services/GearSwapCodeGenerator.Validate.cs
using Vanalytics.Core.DTOs.Blueprints;

namespace Vanalytics.Core.Services;

public static partial class GearSwapCodeGenerator
{
    // Shared state for one Validate() run.
    private sealed record ValCtx(
        BlueprintGraphDto Graph,
        IReadOnlyDictionary<string, BlueprintNodeDto> ById,
        IReadOnlyDictionary<long, ResolvedGearSet> SetsById,
        HashSet<string> ExecReachable,
        HashSet<string> CondReachable);

    private static Diagnostic Err(string message, string? nodeId) =>
        new() { Severity = "error", Message = message, NodeId = nodeId };

    private static Diagnostic Warn(string message, string? nodeId) =>
        new() { Severity = "warning", Message = message, NodeId = nodeId };

    /// <summary>
    /// Validates a blueprint graph for codegen. Returns a unified list of error and warning
    /// diagnostics, each tagged with the offending NodeId (null = graph-wide). An empty list means
    /// the graph generates cleanly. Reuses the generator's own resolution semantics so validation
    /// cannot drift from codegen.
    /// </summary>
    public static List<Diagnostic> Validate(BlueprintGraphDto graph, IReadOnlyCollection<ResolvedGearSet> sets)
    {
        var byId = graph.Nodes.GroupBy(n => n.Id).ToDictionary(g => g.Key, g => g.First());
        var setsById = sets.GroupBy(s => s.Id).ToDictionary(g => g.Key, g => g.First());
        var (exec, cond) = Reachable(graph, byId);
        var ctx = new ValCtx(graph, byId, setsById, exec, cond);

        var diags = new List<Diagnostic>();
        CheckEquipNoSet(ctx, diags);
        return diags;
    }

    private static void CheckEquipNoSet(ValCtx ctx, List<Diagnostic> diags)
    {
        foreach (var n in ctx.Graph.Nodes.Where(n => n.Type == "equip" && ctx.ExecReachable.Contains(n.Id)))
            if (n.Data.GearSetId is null && (n.Data.OverlaySetIds is null || n.Data.OverlaySetIds.Count == 0))
                diags.Add(Err("Equip node has no gear set selected.", n.Id));
    }

    // exec = nodes reachable from any trigger pin via exec flow (equip/branch/mode); a branch expands
    // its true/false subtrees. cond = condition-subgraph nodes feeding any reachable branch's `cond`.
    private static (HashSet<string> Exec, HashSet<string> Cond) Reachable(
        BlueprintGraphDto graph, IReadOnlyDictionary<string, BlueprintNodeDto> byId)
    {
        var exec = new HashSet<string>();
        void WalkExec(string id)
        {
            if (!exec.Add(id)) return;
            if (!byId.TryGetValue(id, out var n)) return;
            if (n.Type == "branch")
                foreach (var h in new[] { "true", "false" })
                    foreach (var e in graph.Edges.Where(e => e.Source == id && e.SourceHandle == h))
                        WalkExec(e.Target);
            // equip / mode are terminal exec targets
        }
        foreach (var e in graph.Edges)
            if (Triggers.ContainsKey(NodeType(graph, e.Source)))
                WalkExec(e.Target);

        var cond = new HashSet<string>();
        void WalkCond(string id)
        {
            if (!cond.Add(id)) return;
            foreach (var e in graph.Edges.Where(e => e.Target == id))   // condition data inputs
                WalkCond(e.Source);
        }
        foreach (var bId in exec.Where(id => byId.TryGetValue(id, out var n) && n.Type == "branch"))
            foreach (var e in graph.Edges.Where(e => e.Target == bId && e.TargetHandle == "cond"))
                WalkCond(e.Source);

        return (exec, cond);
    }
}
