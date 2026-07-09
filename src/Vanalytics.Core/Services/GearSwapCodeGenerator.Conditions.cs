// src/Vanalytics.Core/Services/GearSwapCodeGenerator.Conditions.cs
using Vanalytics.Core.DTOs.Blueprints;

namespace Vanalytics.Core.Services;

public static partial class GearSwapCodeGenerator
{
    private static readonly HashSet<string> StatResources = new() { "hp", "hpp", "mp", "mpp", "tp" };
    private static readonly HashSet<string> StatOps = new() { "<", "<=", ">", ">=", "==", "~=" };
    // Value-node numeric sources: stored Resource -> Lua accessor. Player stats keep player.<r>; pet/world
    // stats map to their own globals. op:compare's INLINE resource stays player-only (StatResources) — pet
    // and world numerics only reach codegen via a wired value node.
    private static readonly Dictionary<string, string> ValueSources = new()
    {
        ["hp"] = "player.hp", ["hpp"] = "player.hpp", ["mp"] = "player.mp", ["mpp"] = "player.mpp", ["tp"] = "player.tp",
        ["pet.tp"] = "pet.tp", ["pet.hpp"] = "pet.hpp", ["world.moon"] = "world.moon.percent",
    };
    // Fallback add_to_chat color when a print node has no ChatColor (the UI seeds one on create).
    private const int DefaultChatColor = 1;
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
                    "name"     => $"spell.english == {slit}",
                    "skill"    => $"spell.skill == {slit}",
                    "element"  => $"spell.element == {slit}",
                    // Plain (non-pattern) substring search: the 1,true args make string.find match the
                    // literal — required because family values like 'Indi-'/'Geo-' contain '-', a Lua
                    // pattern metacharacter. Returns a number (truthy) or nil (falsy); composes under
                    // if / op:and/or/not via Lua truthiness.
                    "contains" => $"string.find(spell.english, {slit}, 1, true)",
                    // BLU category: truthy lookup in the blu_cat_<slug> membership table emitted by
                    // EmitBluCategoryTables (the runtime has no class/stat data). Returns true or nil.
                    "bluCategory" => $"blu_cat_{BluCategorySlug(sval)}[spell.english]",
                    _          => null,
                };

            case "pet":
                // pet.status / weather / day values are emitted VERBATIM (from a curated picker) — unlike
                // buff, which lowercases for buffactive[]. Title-cased status strings (Idle/Engaged/Dead).
                return n.Data.PetField switch
                {
                    "exists" => "pet.isvalid",
                    "status" => string.IsNullOrWhiteSpace(n.Data.PetValue)
                        ? null : $"pet.status == {GearSwapLua.Key(n.Data.PetValue)}",
                    _ => null,
                };

            case "world":
                switch (n.Data.WorldField)
                {
                    case "moghouse": return "world.in_mog_house";
                    case "weather": return string.IsNullOrWhiteSpace(n.Data.WorldValue)
                        ? null : $"world.weather_element == {GearSwapLua.Key(n.Data.WorldValue)}";
                    case "day": return string.IsNullOrWhiteSpace(n.Data.WorldValue)
                        ? null : $"world.day_element == {GearSwapLua.Key(n.Data.WorldValue)}";
                    case "zone": return int.TryParse(n.Data.WorldValue, out var zid)
                        ? $"world.zone_id == {zid}" : null;
                    default: return null;
                }

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
            return n.Data.Resource is { } r && ValueSources.TryGetValue(r, out var acc) ? acc : null;
        return null;
    }

    // Recursively emits the exec flow at <targetId> as indented Lua statements (4*indent leading
    // spaces, no leading/trailing newline). branch -> if/else (no pass-through). equip/mode/lua/print
    // are sequential statements: each emits its own line(s), then follows its single 'out' exec edge to
    // the next node and appends it on the following line at the SAME indent (UE "then" wiring). A node
    // with no 'out' edge is terminal — identical to today. Null when nothing in the chain resolves.
    private static string? EmitExec(ExecCtx ctx, string targetId, int indent, HashSet<string> visited)
    {
        // Note: unlike BoolExpr (which copies `visited` per child for DAG reuse), exec flow shares one
        // `visited` — each exec node emits at most once; a pure "then" chain has no node convergence.
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

        var self = node.Type switch
        {
            "mode" => ctx.ModeNsById.TryGetValue(targetId, out var ns)
                ? $"{pad}equip(sets.{ns}[{ns}_Set_Names[{ns}_Index]])" : null,
            "equip" => EquipExpr(node.Data.GearSetId, node.Data.OverlaySetIds, ctx.Names) is { } expr
                ? $"{pad}equip({expr})" : null,
            "lua" => EmitRawLua(node.Data.Code, pad),
            "print" => EmitPrint(node.Data, pad),
            _ => null,
        };

        // Follow the single exec 'out' edge (sequential chain). A node that itself resolves to nothing
        // (e.g. deleted set) is skipped but the chain still continues.
        var next = ExecTargetOf(ctx, targetId, "out");
        var tail = next is null ? null : EmitExec(ctx, next, indent, visited);
        if (self is null) return tail;
        return tail is null ? self : $"{self}\n{tail}";
    }

    // Raw Lua emitted verbatim, each non-empty line prefixed with `pad` (the author's own relative
    // indentation is preserved on top of that base). Null/blank -> null (skipped).
    // Trailing newlines (common from a textarea) are stripped so they don't leak a blank line into the
    // emitted function body; internal blank lines authored between statements are preserved.
    private static string? EmitRawLua(string? code, string pad)
    {
        if (string.IsNullOrWhiteSpace(code)) return null;
        var lines = code.Replace("\r\n", "\n").Replace("\r", "\n").Split('\n');
        var sb = new System.Text.StringBuilder();
        for (var i = 0; i < lines.Length; i++)
        {
            if (i > 0) sb.Append('\n');
            var line = lines[i].TrimEnd();
            if (line.Length > 0) sb.Append(pad).Append(line);
        }
        return sb.ToString().TrimEnd('\n');
    }

    // add_to_chat(<color>, '<text>') at the given pad. Null/blank text -> null (skipped).
    private static string? EmitPrint(BlueprintNodeDataDto data, string pad)
    {
        if (string.IsNullOrWhiteSpace(data.ChatText)) return null;
        var color = data.ChatColor ?? DefaultChatColor;
        return $"{pad}add_to_chat({color}, {GearSwapLua.Key(data.ChatText)})";
    }
}
