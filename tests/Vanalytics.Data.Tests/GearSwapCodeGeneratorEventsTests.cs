// tests/Vanalytics.Data.Tests/GearSwapCodeGeneratorEventsTests.cs
using Vanalytics.Core.DTOs.Blueprints;
using Vanalytics.Core.Services;

namespace Vanalytics.Data.Tests;

public class GearSwapCodeGeneratorEventsTests
{
    private static BlueprintGraphDto Graph(BlueprintNodeDto[] nodes, BlueprintEdgeDto[] edges) =>
        new() { Version = 1, Nodes = [.. nodes], Edges = [.. edges] };

    private static BlueprintNodeDto Trigger(string id, string type) =>
        new() { Id = id, Type = type, Data = new() };

    private static BlueprintNodeDto Equip(string id, long setId) =>
        new() { Id = id, Type = "equip", Data = new() { GearSetId = setId } };

    // Overload: allows passing set id as a parseable string (e.g. "3") — string→long is not implicit in C#.
    private static BlueprintNodeDto Equip(string id, string setId) =>
        Equip(id, long.Parse(setId));

    private static BlueprintEdgeDto Edge(string source, string handle, string target) =>
        new() { Id = $"{source}-{handle}-{target}", Source = source, SourceHandle = handle, Target = target, TargetHandle = "in" };

    private static BlueprintNodeDto EquipNamed(string id, long setId, string action) =>
        new() { Id = id, Type = "equip", Data = new() { GearSetId = setId, ActionName = action } };

    private static readonly Dictionary<long, string> Names = new()
    {
        [1] = "TP Accuracy", [2] = "Idle Default", [3] = "WS Rudra",
        [4] = "Cure Set", [5] = "Ranged Set", [6] = "SA Set",
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

    [Fact]
    public void Midcast_magic_generic_only_emits_bare_equip()
    {
        var graph = Graph(
            [Trigger("t","trigger:midcast"), Equip("e",2)],
            [Edge("t","Magic","e")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("function midcast(spell)", lua);
        Assert.Contains("if spell.action_type == 'Magic' then equip(sets['Idle Default'])", lua);
        Assert.DoesNotContain("spell.english", lua);
    }

    [Fact]
    public void Midcast_magic_named_plus_generic_nests_on_spell_english()
    {
        var graph = Graph(
            [Trigger("t","trigger:midcast"), EquipNamed("e1",4,"Cure IV"), Equip("e2",2)],
            [Edge("t","Magic","e1"), Edge("t","Magic","e2")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("if spell.action_type == 'Magic' then", lua);
        Assert.Contains("if spell.english == 'Cure IV' then equip(sets['Cure Set'])", lua);
        Assert.Contains("else equip(sets['Idle Default'])", lua);
    }

    [Fact]
    public void Midcast_ranged_is_terminal_flat_equip()
    {
        var graph = Graph(
            [Trigger("t","trigger:midcast"), Equip("e",5)],
            [Edge("t","Ranged","e")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("if spell.action_type == 'Ranged Attack' then equip(sets['Ranged Set'])", lua);
    }

    [Fact]
    public void Midcast_mixes_magic_category_and_ranged_terminal()
    {
        var graph = Graph(
            [Trigger("t","trigger:midcast"), Equip("e1",2), Equip("e2",5)],
            [Edge("t","Magic","e1"), Edge("t","Ranged","e2")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("if spell.action_type == 'Magic' then equip(sets['Idle Default'])", lua);
        Assert.Contains("elseif spell.action_type == 'Ranged Attack' then equip(sets['Ranged Set'])", lua);
    }

    [Fact]
    public void BuffChange_gained_named_only_has_no_else()
    {
        var graph = Graph(
            [Trigger("t","trigger:buff_change"), EquipNamed("e",6,"Sneak Attack")],
            [Edge("t","Gained","e")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("function buff_change(buff, gain)", lua);
        Assert.Contains("if gain then", lua);
        Assert.Contains("if buff == 'Sneak Attack' then equip(sets['SA Set'])", lua);
        Assert.DoesNotContain("else equip", lua);
    }

    [Fact]
    public void BuffChange_gained_and_lost_dispatch_on_buff_verbatim()
    {
        var graph = Graph(
            [Trigger("t","trigger:buff_change"), EquipNamed("e1",6,"Sneak Attack"), EquipNamed("e2",2,"doom")],
            [Edge("t","Gained","e1"), Edge("t","Lost","e2")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("if gain then", lua);
        Assert.Contains("if buff == 'Sneak Attack' then equip(sets['SA Set'])", lua);
        Assert.Contains("elseif not gain then", lua);
        Assert.Contains("if buff == 'doom' then equip(sets['Idle Default'])", lua);  // raw lowercase en
        Assert.DoesNotContain("spell.english", lua);
    }
}
