// tests/Vanalytics.Data.Tests/GearSwapCodeGeneratorCombineTests.cs
using Vanalytics.Core.DTOs.Blueprints;
using Vanalytics.Core.Services;

namespace Vanalytics.Data.Tests;

public class GearSwapCodeGeneratorCombineTests
{
    private static ResolvedGearSet Set(long id, string name) =>
        new(id, name, [new ResolvedSlot("Head", 100 + (int)id, $"Hat{id}", [])]);

    private static BlueprintNodeDto Combine(string id, params long[] componentIds) =>
        new() { Id = id, Type = "combine", Data = new() { CombineSetIds = [.. componentIds] } };

    private static BlueprintEdgeDto Edge(string src, string handle, string tgt) =>
        new() { Id = $"{src}-{handle}-{tgt}", Source = src, SourceHandle = handle, Target = tgt, TargetHandle = "in" };

    [Fact]
    public void CombineExpr_joins_components_right_most_wins()
    {
        var names = new Dictionary<long, string> { [10] = "Accuracy", [11] = "TH Swap" };
        Assert.Equal("set_combine(sets['Accuracy'], sets['TH Swap'])",
            GearSwapCodeGenerator.CombineExpr([10, 11], names));
    }

    [Fact]
    public void CombineExpr_returns_null_when_fewer_than_two_resolve()
    {
        var names = new Dictionary<long, string> { [10] = "Accuracy" };
        Assert.Null(GearSwapCodeGenerator.CombineExpr([10, 999], names));   // 999 unresolved -> only 1 left
        Assert.Null(GearSwapCodeGenerator.CombineExpr([], names));
    }

    [Fact]
    public void CombineExpr_supports_three_layers_in_order()
    {
        var names = new Dictionary<long, string> { [1] = "A", [2] = "B", [3] = "C" };
        Assert.Equal("set_combine(sets['A'], sets['B'], sets['C'])",
            GearSwapCodeGenerator.CombineExpr([1, 2, 3], names));
    }

    [Fact]
    public void Terminal_pin_to_combine_emits_set_combine_and_component_sets()
    {
        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id = "t", Type = "trigger:status_change", Data = new() },
                Combine("c", 10, 11),
            ],
            Edges = [ Edge("t", "Idle", "c") ],
        };

        var r = GearSwapCodeGenerator.Generate(graph, [Set(10, "Idle Base"), Set(11, "MDT Swap")]);

        // Components emitted as top-level named sets so set_combine can reference them.
        Assert.Contains("sets['Idle Base'] = {", r.Lua);
        Assert.Contains("sets['MDT Swap'] = {", r.Lua);
        // Terminal handler equips the merged set.
        Assert.Contains("if new == 'Idle' then equip(set_combine(sets['Idle Base'], sets['MDT Swap']))", r.Lua);
        Assert.Empty(r.Warnings);
    }

    [Fact]
    public void Unused_combine_emits_nothing()
    {
        var graph = new BlueprintGraphDto { Nodes = [Combine("c", 10, 11)], Edges = [] };

        var r = GearSwapCodeGenerator.Generate(graph, [Set(10, "Idle Base"), Set(11, "MDT Swap")]);

        Assert.DoesNotContain("set_combine", r.Lua);
        Assert.DoesNotContain("sets['Idle Base']", r.Lua);
    }
}
