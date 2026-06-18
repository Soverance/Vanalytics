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
        CheckBranches(ctx, diags);
        CheckConditions(ctx, diags);
        CheckDeletedSets(ctx, diags);
        CheckZeroMemberModes(ctx, diags);
        CheckOrphans(ctx, diags);
        CheckEmpty(ctx, diags);
        CheckFullOverlay(ctx, diags);
        return diags;
    }

    private static void CheckEquipNoSet(ValCtx ctx, List<Diagnostic> diags)
    {
        foreach (var n in ctx.Graph.Nodes.Where(n => n.Type == "equip" && ctx.ExecReachable.Contains(n.Id)))
            if (n.Data.GearSetId is null && (n.Data.OverlaySetIds is null || n.Data.OverlaySetIds.Count == 0))
                diags.Add(Err("Equip node has no gear set selected.", n.Id));
    }

    private static void CheckBranches(ValCtx ctx, List<Diagnostic> diags)
    {
        foreach (var n in ctx.Graph.Nodes.Where(n => n.Type == "branch" && ctx.ExecReachable.Contains(n.Id)))
        {
            var hasCond = ctx.Graph.Edges.Any(e => e.Target == n.Id && e.TargetHandle == "cond");
            if (!hasCond)
                diags.Add(Err("Branch has no condition connected.", n.Id));

            var hasOutcome = ctx.Graph.Edges.Any(e => e.Source == n.Id && (e.SourceHandle == "true" || e.SourceHandle == "false"));
            if (!hasOutcome)
                diags.Add(Err("Branch has no outcome connected (neither True nor False).", n.Id));
        }
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

    private static void CheckConditions(ValCtx ctx, List<Diagnostic> diags)
    {
        foreach (var id in ctx.CondReachable)
        {
            if (!ctx.ById.TryGetValue(id, out var n)) continue;
            switch (n.Type)
            {
                case "buff":
                    if (string.IsNullOrWhiteSpace(n.Data.BuffName))
                        diags.Add(Err("Buff condition has no buff selected.", id));
                    break;
                case "op:compare":
                    if (!IsCompareComplete(ctx, n))
                        diags.Add(Err("Comparison is incomplete — it needs an operator, a threshold, and a value to compare.", id));
                    break;
                case "op:and":
                case "op:or":
                    if (!HasInput(ctx, id, "a") || !HasInput(ctx, id, "b"))
                        diags.Add(Err("AND/OR condition is missing an input.", id));
                    break;
                case "op:not":
                    if (!HasInput(ctx, id, "in"))
                        diags.Add(Err("NOT condition is missing an input.", id));
                    break;
            }
        }
    }

    private static bool HasInput(ValCtx ctx, string nodeId, string handle) =>
        ctx.Graph.Edges.Any(e => e.Target == nodeId && e.TargetHandle == handle);

    private static void CheckDeletedSets(ValCtx ctx, List<Diagnostic> diags)
    {
        // id != 0 (0 = unset base, handled by the no-set error) and absent from the resolved sets.
        bool Missing(long? id) => id is { } v && v != 0 && !ctx.SetsById.ContainsKey(v);

        foreach (var n in ctx.Graph.Nodes)
        {
            IEnumerable<long?> refs = n.Type switch
            {
                "equip" => new[] { n.Data.GearSetId }.Concat((n.Data.OverlaySetIds ?? []).Select(x => (long?)x)),
                "mode"  => (n.Data.Members ?? []).SelectMany(m =>
                               new[] { (long?)m.GearSetId }.Concat((m.OverlaySetIds ?? []).Select(x => (long?)x))),
                _ => Array.Empty<long?>(),
            };
            if (refs.Any(Missing))
                diags.Add(Warn("References a gear set that no longer exists; that step will be skipped.", n.Id));
        }
    }

    private static void CheckZeroMemberModes(ValCtx ctx, List<Diagnostic> diags)
    {
        foreach (var n in ctx.Graph.Nodes.Where(n => n.Type == "mode"))
            if ((n.Data.Members?.Count ?? 0) == 0)
                diags.Add(Warn("Mode has no member sets; it will not appear in the file.", n.Id));
    }

    private static void CheckOrphans(ValCtx ctx, List<Diagnostic> diags)
    {
        foreach (var n in ctx.Graph.Nodes)
        {
            if (n.Type.StartsWith("trigger:")) continue;   // triggers are roots
            if (n.Type == "comment") continue;             // documentation only
            if (n.Type == "mode") continue;                // cycle-only modes are intentionally unwired
            if (ctx.ExecReachable.Contains(n.Id) || ctx.CondReachable.Contains(n.Id)) continue;
            diags.Add(Warn("This node isn't connected to anything that runs; it will be ignored.", n.Id));
        }
    }

    private static void CheckEmpty(ValCtx ctx, List<Diagnostic> diags)
    {
        var anyTriggerWired = ctx.Graph.Edges.Any(e => Triggers.ContainsKey(NodeType(ctx.Graph, e.Source)));
        var hasNonEmptyMode = ctx.Graph.Nodes.Any(n => n.Type == "mode" && (n.Data.Members?.Count ?? 0) > 0);
        // Only when no more-specific diagnostic already fired (CheckEmpty runs last).
        if (diags.Count == 0 && (ctx.Graph.Nodes.Count == 0 || (!anyTriggerWired && !hasNonEmptyMode)))
            diags.Add(Warn("Blueprint is empty; a minimal file will be generated.", null));
    }

    private static void CheckFullOverlay(ValCtx ctx, List<Diagnostic> diags)
    {
        bool IsFull(long id) => ctx.SetsById.TryGetValue(id, out var s)
            && s.Slots.Count(sl => sl.ItemId != 0 && !string.IsNullOrEmpty(sl.ItemName)) == 16;

        foreach (var n in ctx.Graph.Nodes)
        {
            IEnumerable<long> overlays = n.Type switch
            {
                "equip" => n.Data.OverlaySetIds ?? Enumerable.Empty<long>(),
                "mode"  => (n.Data.Members ?? []).SelectMany(m => m.OverlaySetIds ?? Enumerable.Empty<long>()),
                _ => Enumerable.Empty<long>(),
            };
            if (overlays.Any(IsFull))
                diags.Add(Warn("A full 16-slot gear set is used as an override layer; it will mask the layers beneath it.", n.Id));
        }
    }

    // Mirrors the op:compare null-conditions in Conditions.cs (BoolExpr + NumExpr).
    private static bool IsCompareComplete(ValCtx ctx, BlueprintNodeDto n)
    {
        if (string.IsNullOrWhiteSpace(n.Data.Op) || !StatOps.Contains(n.Data.Op) || n.Data.Value is null)
            return false;
        var wired = ctx.Graph.Edges.FirstOrDefault(e => e.Target == n.Id && e.TargetHandle == "in")?.Source;
        var wiredOk = wired is not null && ctx.ById.TryGetValue(wired, out var src)
            && src.Type == "value" && !string.IsNullOrWhiteSpace(src.Data.Resource)
            && StatResources.Contains(src.Data.Resource!);
        var ownResOk = !string.IsNullOrWhiteSpace(n.Data.Resource) && StatResources.Contains(n.Data.Resource!);
        return wiredOk || ownResOk;
    }
}
