// tests/Vanalytics.Data.Tests/GearSwapCodeGeneratorValidateTests.cs
using Vanalytics.Core.DTOs.Blueprints;
using Vanalytics.Core.Services;

namespace Vanalytics.Data.Tests;

public class GearSwapCodeGeneratorValidateTests
{
    // ---- builders -------------------------------------------------------
    private static BlueprintNodeDto Node(string id, string type, BlueprintNodeDataDto? data = null) =>
        new() { Id = id, Type = type, Data = data ?? new() };

    private static BlueprintEdgeDto Edge(string source, string sh, string target, string th) =>
        new() { Id = $"{source}-{sh}-{target}", Source = source, SourceHandle = sh, Target = target, TargetHandle = th };

    private static ResolvedGearSet Set(long id, string name) =>
        new(id, name, [new ResolvedSlot("Head", 5, "Hat", [])]);

    [Fact]
    public void Valid_graph_returns_no_diagnostics()
    {
        // status_change Engaged -> equip(set 1)
        var graph = new BlueprintGraphDto
        {
            Nodes = [ Node("t", "trigger:status_change"), Node("e", "equip", new() { GearSetId = 1 }) ],
            Edges = [ Edge("t", "Engaged", "e", "in") ],
        };

        var diags = GearSwapCodeGenerator.Validate(graph, [Set(1, "TP")]);

        Assert.Empty(diags);
    }
}
