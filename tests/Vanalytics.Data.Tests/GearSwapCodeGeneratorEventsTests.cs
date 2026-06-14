// tests/Vanalytics.Data.Tests/GearSwapCodeGeneratorEventsTests.cs
using Vanalytics.Core.DTOs.Workflows;
using Vanalytics.Core.Services;

namespace Vanalytics.Data.Tests;

public class GearSwapCodeGeneratorEventsTests
{
    private static WorkflowGraphDto Graph(WorkflowNodeDto[] nodes, WorkflowEdgeDto[] edges) =>
        new() { Version = 1, Nodes = [.. nodes], Edges = [.. edges] };

    private static WorkflowNodeDto Trigger(string id, string type) =>
        new() { Id = id, Type = type, Data = new() };

    private static WorkflowNodeDto Equip(string id, long setId) =>
        new() { Id = id, Type = "equip", Data = new() { GearSetId = setId } };

    // Overload: allows passing set id as a parseable string (e.g. "3") — string→long is not implicit in C#.
    private static WorkflowNodeDto Equip(string id, string setId) =>
        Equip(id, long.Parse(setId));

    private static WorkflowEdgeDto Edge(string source, string handle, string target) =>
        new() { Id = $"{source}-{handle}-{target}", Source = source, SourceHandle = handle, Target = target, TargetHandle = "in" };

    private static readonly Dictionary<long, string> Names = new()
    {
        [1] = "TP Accuracy", [2] = "Idle Default", [3] = "WS Rudra",
    };

    [Fact]
    public void StatusChange_emits_if_elseif_chain_on_new_status()
    {
        var graph = Graph(
            [Trigger("t","trigger:status_change"), Equip("e1",1), Equip("e2",2)],
            [Edge("t","Engaged","e1"), Edge("t","Idle","e2")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("function status_change(new, old)", lua);
        Assert.Contains("if new == 'Engaged' then equip(sets['TP Accuracy'])", lua);
        Assert.Contains("elseif new == 'Idle' then equip(sets['Idle Default'])", lua);
        Assert.Contains("end", lua);
    }

    [Fact]
    public void Precast_branches_on_spell_type_and_action_type()
    {
        var graph = Graph(
            [Trigger("t","trigger:precast"), Equip("e","3")],
            [Edge("t","WeaponSkill","e")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("function precast(spell)", lua);
        Assert.Contains("if spell.type == 'WeaponSkill' then equip(sets['WS Rudra'])", lua);
    }

    [Fact]
    public void Aftercast_uses_player_status()
    {
        var graph = Graph(
            [Trigger("t","trigger:aftercast"), Equip("e1",1), Equip("e2",2)],
            [Edge("t","Engaged","e1"), Edge("t","Idle","e2")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("function aftercast(spell)", lua);
        Assert.Contains("if player.status == 'Engaged' then equip(sets['TP Accuracy'])", lua);
        Assert.Contains("elseif player.status ~= 'Engaged' then equip(sets['Idle Default'])", lua);
    }

    [Fact]
    public void Unwired_trigger_emits_no_function()
    {
        var graph = Graph([Trigger("t","trigger:precast")], []);
        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);
        Assert.DoesNotContain("function precast", lua);
    }
}
