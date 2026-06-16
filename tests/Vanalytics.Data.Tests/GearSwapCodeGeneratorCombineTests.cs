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
}
