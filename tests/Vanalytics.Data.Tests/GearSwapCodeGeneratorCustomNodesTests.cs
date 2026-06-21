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
}
