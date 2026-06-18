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

    [Fact]
    public void Equip_node_with_no_gear_set_is_an_error()
    {
        var graph = new BlueprintGraphDto
        {
            Nodes = [ Node("t", "trigger:status_change"), Node("e", "equip") ],   // no GearSetId
            Edges = [ Edge("t", "Engaged", "e", "in") ],
        };

        var diags = GearSwapCodeGenerator.Validate(graph, []);

        var d = Assert.Single(diags, x => x.NodeId == "e");
        Assert.Equal("error", d.Severity);
        Assert.Contains("gear set", d.Message);
    }

    [Fact]
    public void Branch_with_no_condition_is_an_error()
    {
        // trigger -> branch -> equip(set), but nothing wired to branch.cond
        var graph = new BlueprintGraphDto
        {
            Nodes = [ Node("t", "trigger:status_change"), Node("b", "branch"), Node("e", "equip", new() { GearSetId = 1 }) ],
            Edges = [ Edge("t", "Idle", "b", "in"), Edge("b", "true", "e", "in") ],
        };

        var diags = GearSwapCodeGenerator.Validate(graph, [Set(1, "TP")]);

        Assert.Contains(diags, d => d.NodeId == "b" && d.Severity == "error" && d.Message.Contains("condition"));
    }

    [Fact]
    public void Branch_with_no_outcome_is_an_error()
    {
        // trigger -> branch with a condition, but no true/false wired
        var graph = new BlueprintGraphDto
        {
            Nodes = [ Node("t", "trigger:status_change"), Node("b", "branch"),
                      Node("c", "op:compare", new() { Resource = "hpp", Op = "<", Value = 25 }) ],
            Edges = [ Edge("t", "Idle", "b", "in"), Edge("c", "out", "b", "cond") ],
        };

        var diags = GearSwapCodeGenerator.Validate(graph, []);

        Assert.Contains(diags, d => d.NodeId == "b" && d.Severity == "error" && d.Message.Contains("outcome"));
    }

    private static BlueprintGraphDto BranchWithCond(params BlueprintNodeDto[] condNodes)
    {
        // trigger -> branch(true->equip set1); a cond node "c" is wired to branch.cond
        var nodes = new List<BlueprintNodeDto>
        {
            Node("t", "trigger:status_change"), Node("b", "branch"), Node("e", "equip", new() { GearSetId = 1 }),
        };
        nodes.AddRange(condNodes);
        return new BlueprintGraphDto
        {
            Nodes = nodes,
            Edges = [ Edge("t", "Idle", "b", "in"), Edge("b", "true", "e", "in"), Edge("c", "out", "b", "cond") ],
        };
    }

    [Fact]
    public void Buff_condition_with_no_buff_is_an_error()
    {
        var graph = BranchWithCond(Node("c", "buff"));   // BuffName null
        var diags = GearSwapCodeGenerator.Validate(graph, [Set(1, "TP")]);
        Assert.Contains(diags, d => d.NodeId == "c" && d.Severity == "error" && d.Message.Contains("buff"));
    }

    [Fact]
    public void Incomplete_comparison_is_an_error()
    {
        var graph = BranchWithCond(Node("c", "op:compare", new() { Op = "<", Value = 25 }));   // no Resource, no wired input
        var diags = GearSwapCodeGenerator.Validate(graph, [Set(1, "TP")]);
        Assert.Contains(diags, d => d.NodeId == "c" && d.Severity == "error" && d.Message.Contains("Comparison"));
    }

    [Fact]
    public void And_node_missing_input_is_an_error()
    {
        // c = op:and with only input 'a' wired (to a complete buff); 'b' missing
        var graph = BranchWithCond(Node("c", "op:and"), Node("a1", "buff", new() { BuffName = "Sneak Attack" }));
        graph.Edges.Add(Edge("a1", "out", "c", "a"));
        var diags = GearSwapCodeGenerator.Validate(graph, [Set(1, "TP")]);
        Assert.Contains(diags, d => d.NodeId == "c" && d.Severity == "error" && d.Message.Contains("input"));
    }

    [Fact]
    public void Complete_comparison_with_own_resource_is_valid()
    {
        var graph = BranchWithCond(Node("c", "op:compare", new() { Resource = "hpp", Op = "<", Value = 25 }));
        var diags = GearSwapCodeGenerator.Validate(graph, [Set(1, "TP")]);
        Assert.Empty(diags);
    }

    [Fact]
    public void Not_node_missing_input_is_an_error()
    {
        var graph = BranchWithCond(Node("c", "op:not"));   // nothing wired to 'in'
        var diags = GearSwapCodeGenerator.Validate(graph, [Set(1, "TP")]);
        Assert.Contains(diags, d => d.NodeId == "c" && d.Severity == "error" && d.Message.Contains("input"));
    }

    [Fact]
    public void Comparison_with_valid_wired_value_input_is_valid()
    {
        // op:compare with Op/Value but NO own Resource; a 'value' node (Resource hpp) wired to its 'in'
        var graph = BranchWithCond(Node("c", "op:compare", new() { Op = "<", Value = 25 }),
                                   Node("v", "value", new() { Resource = "hpp" }));
        graph.Edges.Add(Edge("v", "out", "c", "in"));
        var diags = GearSwapCodeGenerator.Validate(graph, [Set(1, "TP")]);
        Assert.Empty(diags);
    }

    [Fact]
    public void Deleted_gear_set_reference_is_a_warning()
    {
        var graph = new BlueprintGraphDto
        {
            Nodes = [ Node("t", "trigger:status_change"), Node("e", "equip", new() { GearSetId = 999 }) ],
            Edges = [ Edge("t", "Engaged", "e", "in") ],
        };

        var diags = GearSwapCodeGenerator.Validate(graph, []);   // set 999 not provided

        Assert.Contains(diags, d => d.NodeId == "e" && d.Severity == "warning" && d.Message.Contains("no longer exists"));
        Assert.DoesNotContain(diags, d => d.Severity == "error");   // GearSetId is set -> not a "no set" error
    }

    [Fact]
    public void Mode_with_zero_members_is_a_warning()
    {
        var graph = new BlueprintGraphDto
        {
            Nodes = [ Node("m", "mode", new() { ModeName = "TP", Members = [] }) ],
            Edges = [],
        };

        var diags = GearSwapCodeGenerator.Validate(graph, []);

        Assert.Contains(diags, d => d.NodeId == "m" && d.Severity == "warning" && d.Message.Contains("member"));
    }
}
