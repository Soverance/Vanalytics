// tests/Vanalytics.Data.Tests/GearSwapCodeGeneratorCustomNodesTests.cs
using Vanalytics.Core.DTOs.Blueprints;
using Vanalytics.Core.Services;

namespace Vanalytics.Data.Tests;

public class GearSwapCodeGeneratorCustomNodesTests
{
    private static BlueprintGraphDto Graph(BlueprintNodeDto[] nodes, BlueprintEdgeDto[] edges) =>
        new() { Version = 1, Nodes = [.. nodes], Edges = [.. edges] };

    private static BlueprintNodeDto Trigger(string id, string type) => new() { Id = id, Type = type, Data = new() };
    private static BlueprintNodeDto Equip(string id, long setId) => new() { Id = id, Type = "equip", Data = new() { GearSetId = setId } };
    private static BlueprintNodeDto EquipNamed(string id, long setId, string action) => new() { Id = id, Type = "equip", Data = new() { GearSetId = setId, ActionName = action } };
    private static BlueprintNodeDto Branch(string id) => new() { Id = id, Type = "branch", Data = new() };
    private static BlueprintNodeDto CondStat(string id, string resource, string op, int value) => new() { Id = id, Type = "op:compare", Data = new() { Resource = resource, Op = op, Value = value } };
    private static BlueprintNodeDto Setup(string id, string? code) => new() { Id = id, Type = "setup", Data = new() { Code = code } };
    private static BlueprintNodeDto Lua(string id, string? code) => new() { Id = id, Type = "lua", Data = new() { Code = code } };
    private static BlueprintNodeDto Print(string id, string? text, int? color = null) => new() { Id = id, Type = "print", Data = new() { ChatText = text, ChatColor = color } };

    private static BlueprintEdgeDto Edge(string source, string handle, string target) =>
        new() { Id = $"{source}-{handle}-{target}", Source = source, SourceHandle = handle, Target = target, TargetHandle = "in" };
    private static BlueprintEdgeDto CondEdge(string condId, string branchId) =>
        new() { Id = $"{condId}-cond-{branchId}", Source = condId, SourceHandle = "out", Target = branchId, TargetHandle = "cond" };

    private static readonly Dictionary<long, string> Names = new() { [1] = "TP", [2] = "Idle", [3] = "WS Rudra" };
    private static ResolvedGearSet Set(long id, string name) => new(id, name, [new ResolvedSlot("Head", 5, "Hat", [])]);

    [Fact]
    public void Setup_node_emits_code_at_file_top_before_get_sets()
    {
        var graph = Graph([Setup("s", "include('organizer-lib')\nsend_command('input /macro book 1')")], []);

        var lua = GearSwapCodeGenerator.Generate(graph, sets: []).Lua;

        var setupIdx = lua.IndexOf("include('organizer-lib')", StringComparison.Ordinal);
        var getSetsIdx = lua.IndexOf("function get_sets()", StringComparison.Ordinal);
        Assert.True(setupIdx >= 0, "setup code missing");
        Assert.True(setupIdx < getSetsIdx, "setup code must precede get_sets()");
        Assert.Contains("send_command('input /macro book 1')", lua);
    }

    [Fact]
    public void Setup_singleton_uses_first_nonempty_only()
    {
        var graph = Graph([Setup("s1", "   "), Setup("s2", "FIRST_REAL()"), Setup("s3", "SECOND_REAL()")], []);

        var lua = GearSwapCodeGenerator.Generate(graph, sets: []).Lua;

        Assert.Contains("FIRST_REAL()", lua);
        Assert.DoesNotContain("SECOND_REAL()", lua);
    }

    [Fact]
    public void Empty_setup_emits_nothing_extra()
    {
        var graph = Graph([Setup("s", "")], []);
        var lua = GearSwapCodeGenerator.Generate(graph, sets: []).Lua;
        Assert.Contains("function get_sets()", lua);
        Assert.DoesNotContain("\n\n\nfunction get_sets", lua); // no stray blank block
    }

    [Fact]
    public void Print_then_equip_chain_under_a_branch_emits_in_wiring_order()
    {
        // status_change Engaged -> Branch(HP%<25) ? (Print -> Equip) : -
        var graph = Graph(
            [Trigger("t", "trigger:status_change"), Branch("b"), CondStat("c", "hpp", "<", 25),
             Print("p", "Low HP!", 5), Equip("e", 1)],
            [Edge("t", "Engaged", "b"), CondEdge("c", "b"),
             new() { Id = "b-true-p", Source = "b", SourceHandle = "true", Target = "p", TargetHandle = "in" },
             new() { Id = "p-out-e", Source = "p", SourceHandle = "out", Target = "e", TargetHandle = "in" }]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        var pIdx = lua.IndexOf("add_to_chat(5, 'Low HP!')", StringComparison.Ordinal);
        var eIdx = lua.IndexOf("equip(sets['TP'])", StringComparison.Ordinal);
        Assert.True(pIdx >= 0 && eIdx > pIdx, "print must precede the chained equip");
        Assert.Contains("if player.hpp < 25 then", lua);
    }

    [Fact]
    public void Lua_node_emits_code_indented_to_context()
    {
        var graph = Graph(
            [Trigger("t", "trigger:status_change"), Branch("b"), CondStat("c", "hpp", "<", 25),
             Lua("l", "send_command('input /echo hi')")],
            [Edge("t", "Engaged", "b"), CondEdge("c", "b"),
             new() { Id = "b-true-l", Source = "b", SourceHandle = "true", Target = "l", TargetHandle = "in" }]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("send_command('input /echo hi')", lua);
    }

    [Fact]
    public void Chained_equip_after_print_is_emitted_into_get_sets()
    {
        // A set referenced ONLY via a chained equip (print -> equip) must still emit in get_sets().
        var graph = Graph(
            [Trigger("t", "trigger:status_change"), Print("p", "engaged"), Equip("e", 1)],
            [Edge("t", "Engaged", "p"),
             new() { Id = "p-out-e", Source = "p", SourceHandle = "out", Target = "e", TargetHandle = "in" }]);

        var result = GearSwapCodeGenerator.Generate(graph, [Set(1, "TP")]);

        Assert.Contains("sets['TP'] = {", result.Lua);   // chained equip's set emitted
    }

    [Fact]
    public void Terminal_pin_wired_directly_to_print_emits_block_form()
    {
        var graph = Graph(
            [Trigger("t", "trigger:status_change"), Print("p", "Engaged!", 5)],
            [Edge("t", "Engaged", "p")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("function status_change(new, old)", lua);
        // block form: condition on its own line, statement indented beneath
        Assert.Contains("if new == 'Engaged' then\n        add_to_chat(5, 'Engaged!')\n", lua);
    }

    [Fact]
    public void Terminal_pin_equip_then_print_chain_emits_both_in_order()
    {
        var graph = Graph(
            [Trigger("t", "trigger:aftercast"), Equip("e", 2), Print("p", "idle", 5)],
            [Edge("t", "Idle", "e"),
             new() { Id = "e-out-p", Source = "e", SourceHandle = "out", Target = "p", TargetHandle = "in" }]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        var eIdx = lua.IndexOf("equip(sets['Idle'])", StringComparison.Ordinal);
        var pIdx = lua.IndexOf("add_to_chat(5, 'idle')", StringComparison.Ordinal);
        Assert.True(eIdx >= 0 && pIdx > eIdx, "equip must precede the chained print");
    }

    [Fact]
    public void Plain_terminal_equip_stays_inline_byte_identical()
    {
        var graph = Graph(
            [Trigger("t", "trigger:status_change"), Equip("e", 1)],
            [Edge("t", "Engaged", "e")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("if new == 'Engaged' then equip(sets['TP'])", lua);  // inline, unchanged
    }

    [Fact]
    public void Named_category_leaf_that_chains_switches_that_arm_to_block()
    {
        // precast WeaponSkill -> "Rudra's Storm" leaf -> equip set 3, then chained print
        var graph = Graph(
            [Trigger("t", "trigger:precast"), EquipNamed("e", 3, "Rudra's Storm"), Print("p", "WS!", 5)],
            [Edge("t", "WeaponSkill", "e"),
             new() { Id = "e-out-p", Source = "e", SourceHandle = "out", Target = "p", TargetHandle = "in" }]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("if spell.type == 'WeaponSkill' then", lua);
        Assert.Contains("if spell.english == 'Rudra\\'s Storm' then", lua);
        var eIdx = lua.IndexOf("equip(sets['WS Rudra'])", StringComparison.Ordinal);
        var pIdx = lua.IndexOf("add_to_chat(5, 'WS!')", StringComparison.Ordinal);
        Assert.True(eIdx >= 0 && pIdx > eIdx, "chained print must follow the named-leaf equip");
    }
}
