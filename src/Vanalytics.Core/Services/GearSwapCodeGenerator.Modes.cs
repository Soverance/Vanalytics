// src/Vanalytics.Core/Services/GearSwapCodeGenerator.Modes.cs
using System.Text;
using Vanalytics.Core.DTOs.Blueprints;

namespace Vanalytics.Core.Services;

public static partial class GearSwapCodeGenerator
{
    // A resolved mode member: a flat set (SetId) inlined as a slot table, OR a combine (Components)
    // emitted as set_combine(...). Exactly one of SetId/Components is non-null.
    private sealed record ModeMemberInfo(string Label, long? SetId, IReadOnlyList<long>? Components);

    // A non-empty mode resolved for codegen: Namespace is a unique Lua ident; Command is the macro
    // string; Members are in cycle order (index 1 = default).
    private sealed record ModeInfo(
        string NodeId, string Name, string Namespace, string Command,
        IReadOnlyList<ModeMemberInfo> Members);

    // Collect non-empty mode nodes. Member label = explicit Label ?? the set's name; collisions within a
    // mode get a numeric suffix. Members whose set isn't resolvable (deleted) are dropped. Namespaces are
    // de-duplicated across modes (the UI enforces unique names; this is a backstop for valid Lua).
    private static List<ModeInfo> CollectModes(BlueprintGraphDto graph, IReadOnlyDictionary<long, string> names)
    {
        var modes = new List<ModeInfo>();
        // Seed namespace de-dup with flat-set names — those a flat equip leaf emits as top-level
        // sets['Name']. A mode's sets.<NS> is the SAME Lua key as sets['<NS>'], so without this a mode
        // named "TP" would silently clobber a flat set named "TP". Computed from graph+names, which are
        // identical at both CollectModes call sites (Generate + EmitEvents), so the chosen namespaces stay
        // consistent between get_sets definitions and the equip(sets.<NS>[...]) event references.
        var equipById = graph.Nodes.Where(n => n.Type == "equip").ToDictionary(n => n.Id);
        var usedNs = new HashSet<string>();
        foreach (var edge in graph.Edges)
        {
            if (!Triggers.ContainsKey(NodeType(graph, edge.Source))) continue;
            if (!equipById.TryGetValue(edge.Target, out var leaf)) continue;
            if (leaf.Data.GearSetId is { } gid && names.TryGetValue(gid, out var flatName)) usedNs.Add(flatName);
        }
        foreach (var node in graph.Nodes.Where(n => n.Type == "mode"))
        {
            var name = (node.Data.ModeName ?? "").Trim();
            if (name.Length == 0) continue;

            var members = new List<ModeMemberInfo>();
            var usedLabels = new HashSet<string>();
            foreach (var m in node.Data.Members ?? [])
            {
                string label;
                long? setId = null;
                IReadOnlyList<long>? components = null;

                if (m.OverlaySetIds is { Count: > 0 })
                {
                    if (!names.TryGetValue(m.GearSetId, out var setName)) continue;   // base deleted -> drop member
                    var comp = new List<long> { m.GearSetId };
                    comp.AddRange(m.OverlaySetIds.Where(names.ContainsKey));
                    label = string.IsNullOrWhiteSpace(m.Label) ? setName : m.Label!.Trim();
                    if (comp.Count >= 2) components = comp;   // >=2 resolvable -> set_combine; else degrade to plain inline
                    else setId = m.GearSetId;
                }
                else
                {
                    if (!names.TryGetValue(m.GearSetId, out var setName)) continue;   // deleted/unresolved -> drop
                    setId = m.GearSetId;
                    label = string.IsNullOrWhiteSpace(m.Label) ? setName : m.Label!.Trim();
                }

                var unique = label;
                var i = 2;
                while (!usedLabels.Add(unique)) unique = $"{label} {i++}";
                members.Add(new ModeMemberInfo(unique, setId, components));
            }
            if (members.Count == 0) continue;   // zero-member -> skip

            var ns = GearSwapLua.Ident(name);
            var uniqueNs = ns;
            var k = 2;
            while (!usedNs.Add(uniqueNs)) uniqueNs = $"{ns}{k++}";

            var command = string.IsNullOrWhiteSpace(node.Data.ModeCommand) ? $"cycle {name} set" : node.Data.ModeCommand!.Trim();
            modes.Add(new ModeInfo(node.Id, name, uniqueNs, command, members));
        }
        return modes;
    }

    // get_sets body chunk per mode: index init + names array + the namespaced member sets.
    private static string EmitModes(List<ModeInfo> modes, IReadOnlyDictionary<long, ResolvedGearSet> setsById)
    {
        var setNamesById = setsById.ToDictionary(kv => kv.Key, kv => kv.Value.Name);
        var sb = new StringBuilder();
        foreach (var mode in modes)
        {
            sb.Append($"    {mode.Namespace}_Index = 1\n");
            var setNamesLua = string.Join(", ", mode.Members.Select(m => GearSwapLua.Key(m.Label)));
            sb.Append($"    {mode.Namespace}_Set_Names = {{{setNamesLua}}}\n");
            sb.Append($"    sets.{mode.Namespace} = {{}}\n");
            foreach (var m in mode.Members)
            {
                if (m.Components is { } comp)
                {
                    sb.Append($"    sets.{mode.Namespace}[{GearSwapLua.Key(m.Label)}] = {EquipExpr(comp[0], comp.Skip(1).ToList(), setNamesById)}\n");
                }
                else
                {
                    sb.Append($"    sets.{mode.Namespace}[{GearSwapLua.Key(m.Label)}] = {{\n");
                    sb.Append(EmitSlots(setsById[m.SetId!.Value]));
                    sb.Append("    }\n");
                }
            }
        }
        return sb.ToString();
    }

    // self_command(command): one cycle arm per mode — increment+wrap the index, echo, equip current.
    // Reproduces the THF idiom verbatim, preceded by a macro-hint comment block. Empty when no modes.
    private static string EmitSelfCommand(List<ModeInfo> modes)
    {
        if (modes.Count == 0) return "";
        var sb = new StringBuilder();
        sb.Append("-- Bind these in an in-game macro (one line each):\n");
        foreach (var mode in modes)
            sb.Append($"--   /console gs c {mode.Command}\n");
        sb.Append("function self_command(command)\n");
        for (var i = 0; i < modes.Count; i++)
        {
            var m = modes[i];
            var ns = m.Namespace;
            var kw = i == 0 ? "if" : "elseif";
            sb.Append($"    {kw} command == {GearSwapLua.Key(m.Command)} then\n");
            sb.Append($"        {ns}_Index = {ns}_Index + 1\n");
            sb.Append($"        if {ns}_Index > #{ns}_Set_Names then {ns}_Index = 1 end\n");
            sb.Append($"        send_command('@input /echo ----- {GearSwapLua.EscapeSingleQuoted(m.Name)} Set changed to '..{ns}_Set_Names[{ns}_Index]..' -----')\n");
            sb.Append($"        equip(sets.{ns}[{ns}_Set_Names[{ns}_Index]])\n");
        }
        sb.Append("    end\nend\n\n");
        return sb.ToString();
    }
}
