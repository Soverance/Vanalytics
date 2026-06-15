// tests/Vanalytics.Data.Tests/GearSwapCodeGeneratorActionTests.cs
using Vanalytics.Core.DTOs.Workflows;
using Vanalytics.Core.Services;

namespace Vanalytics.Data.Tests;

public class GearSwapCodeGeneratorActionTests
{
    private static WorkflowNodeDto Trigger(string id, string type) => new() { Id = id, Type = type, Data = new() };
    private static WorkflowNodeDto Leaf(string id, long setId, string? action = null) =>
        new() { Id = id, Type = "equip", Data = new() { GearSetId = setId, ActionName = action } };
    private static WorkflowEdgeDto Edge(string source, string handle, string target) =>
        new() { Id = $"{source}-{handle}-{target}", Source = source, SourceHandle = handle, Target = target, TargetHandle = "in" };

    private static readonly Dictionary<long, string> Names = new()
    {
        [1] = "WS Mercy", [2] = "WS Rudra", [3] = "WS Generic",
    };

    [Fact]
    public void Precast_named_leaves_nest_on_spell_english()
    {
        var graph = new WorkflowGraphDto
        {
            Nodes = [Trigger("t", "trigger:precast"), Leaf("a", 1, "Mercy Stroke"), Leaf("b", 2, "Rudra's Storm")],
            Edges = [Edge("t", "WeaponSkill", "a"), Edge("t", "WeaponSkill", "b")],
        };

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("if spell.type == 'WeaponSkill' then", lua);
        Assert.Contains("if spell.english == 'Mercy Stroke' then equip(sets['WS Mercy'])", lua);
        Assert.Contains("elseif spell.english == 'Rudra\\'s Storm' then equip(sets['WS Rudra'])", lua);
    }

    [Fact]
    public void Precast_generic_leaf_becomes_else_fallback()
    {
        var graph = new WorkflowGraphDto
        {
            Nodes = [Trigger("t", "trigger:precast"), Leaf("a", 1, "Mercy Stroke"), Leaf("g", 3, null)],
            Edges = [Edge("t", "WeaponSkill", "a"), Edge("t", "WeaponSkill", "g")],
        };

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("if spell.english == 'Mercy Stroke' then equip(sets['WS Mercy'])", lua);
        Assert.Contains("else equip(sets['WS Generic'])", lua);
    }

    [Fact]
    public void Precast_only_generic_is_inline_equip()
    {
        var graph = new WorkflowGraphDto
        {
            Nodes = [Trigger("t", "trigger:precast"), Leaf("g", 3, null)],
            Edges = [Edge("t", "WeaponSkill", "g")],
        };

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("if spell.type == 'WeaponSkill' then equip(sets['WS Generic'])", lua);
        Assert.DoesNotContain("spell.english", lua);
    }
}
