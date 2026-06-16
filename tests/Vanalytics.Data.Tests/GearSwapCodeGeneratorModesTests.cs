// tests/Vanalytics.Data.Tests/GearSwapCodeGeneratorModesTests.cs
using Vanalytics.Core.DTOs.Blueprints;
using Vanalytics.Core.Services;

namespace Vanalytics.Data.Tests;

public class GearSwapCodeGeneratorModesTests
{
    private static ResolvedGearSet Set(long id, string name) =>
        new(id, name, [new ResolvedSlot("Head", 100 + (int)id, $"Hat{id}", [])]);

    private static BlueprintNodeDto Mode(string id, string name, params long[] memberSetIds) =>
        new()
        {
            Id = id, Type = "mode",
            Data = new() { ModeName = name, Members = [.. memberSetIds.Select(s => new BlueprintModeMemberDto { GearSetId = s })] },
        };

    private static BlueprintEdgeDto Edge(string src, string handle, string tgt) =>
        new() { Id = $"{src}-{handle}-{tgt}", Source = src, SourceHandle = handle, Target = tgt, TargetHandle = "in" };

    [Fact]
    public void Mode_wired_to_status_change_emits_scaffolding_and_current_set_equip()
    {
        var graph = new BlueprintGraphDto
        {
            Nodes = [ new() { Id = "t", Type = "trigger:status_change", Data = new() }, Mode("tp", "TP", 10, 11) ],
            Edges = [ Edge("t", "Engaged", "tp") ],
        };

        var r = GearSwapCodeGenerator.Generate(graph, [Set(10, "Accuracy"), Set(11, "Treasure Hunter")]);

        Assert.Contains("TP_Index = 1", r.Lua);
        Assert.Contains("TP_Set_Names = {'Accuracy', 'Treasure Hunter'}", r.Lua);
        Assert.Contains("sets.TP['Accuracy'] = {", r.Lua);
        Assert.Contains("if new == 'Engaged' then equip(sets.TP[TP_Set_Names[TP_Index]])", r.Lua);
        Assert.Contains("--   /console gs c cycle TP set", r.Lua);
        Assert.Contains("function self_command(command)", r.Lua);
        Assert.Contains("if command == 'cycle TP set' then", r.Lua);
        Assert.Contains("if TP_Index > #TP_Set_Names then TP_Index = 1 end", r.Lua);
        Assert.Contains("equip(sets.TP[TP_Set_Names[TP_Index]])", r.Lua);
        Assert.Empty(r.Warnings);
    }

    [Fact]
    public void Cycle_only_mode_emits_even_without_a_terminal_pin()
    {
        var graph = new BlueprintGraphDto { Nodes = [Mode("w", "Weapon", 20, 21)], Edges = [] };

        var r = GearSwapCodeGenerator.Generate(graph, [Set(20, "Mandau"), Set(21, "Twashtar")]);

        Assert.Contains("Weapon_Set_Names = {'Mandau', 'Twashtar'}", r.Lua);
        Assert.Contains("sets.Weapon['Mandau'] = {", r.Lua);
        Assert.Contains("if command == 'cycle Weapon set' then", r.Lua);
        Assert.DoesNotContain("function status_change", r.Lua);
    }

    [Fact]
    public void Mode_namespace_sanitizes_name_but_command_keeps_spaces()
    {
        var graph = new BlueprintGraphDto { Nodes = [Mode("m", "Ranged TP", 30)], Edges = [] };

        var r = GearSwapCodeGenerator.Generate(graph, [Set(30, "RA")]);

        Assert.Contains("RangedTP_Index = 1", r.Lua);
        Assert.Contains("sets.RangedTP = {}", r.Lua);
        Assert.Contains("if command == 'cycle Ranged TP set' then", r.Lua);
    }

    [Fact]
    public void Two_modes_emit_two_self_command_arms_and_two_terminal_equips()
    {
        var graph = new BlueprintGraphDto
        {
            Nodes = [ new() { Id = "t", Type = "trigger:status_change", Data = new() }, Mode("tp", "TP", 10), Mode("idle", "Idle", 20) ],
            Edges = [ Edge("t", "Engaged", "tp"), Edge("t", "Idle", "idle") ],
        };

        var r = GearSwapCodeGenerator.Generate(graph, [Set(10, "Acc"), Set(20, "Def")]);

        Assert.Contains("if command == 'cycle TP set' then", r.Lua);
        Assert.Contains("elseif command == 'cycle Idle set' then", r.Lua);
        Assert.Contains("if new == 'Engaged' then equip(sets.TP[TP_Set_Names[TP_Index]])", r.Lua);
        Assert.Contains("elseif new == 'Idle' then equip(sets.Idle[Idle_Set_Names[Idle_Index]])", r.Lua);
    }

    [Fact]
    public void Zero_member_mode_is_skipped_entirely()
    {
        var graph = new BlueprintGraphDto
        {
            Nodes = [ new() { Id = "m", Type = "mode", Data = new() { ModeName = "Empty", Members = [] } } ],
            Edges = [],
        };

        var r = GearSwapCodeGenerator.Generate(graph, []);

        Assert.DoesNotContain("Empty_Set_Names", r.Lua);
        Assert.DoesNotContain("function self_command", r.Lua);
    }

    [Fact]
    public void Mode_name_with_apostrophe_is_escaped_in_echo()
    {
        var graph = new BlueprintGraphDto { Nodes = [Mode("m", "Sam's", 10)], Edges = [] };

        var r = GearSwapCodeGenerator.Generate(graph, [Set(10, "RA")]);

        Assert.Contains(@"----- Sam\'s Set changed to", r.Lua);   // apostrophe escaped as \' inside the literal
    }

    [Fact]
    public void Mode_member_referencing_deleted_set_warns_and_skips_that_member()
    {
        var graph = new BlueprintGraphDto { Nodes = [Mode("m", "TP", 10, 999)], Edges = [] };

        var r = GearSwapCodeGenerator.Generate(graph, [Set(10, "Accuracy")]);

        Assert.Contains("999", Assert.Single(r.Warnings));
        Assert.Contains("TP_Set_Names = {'Accuracy'}", r.Lua);
    }

    [Fact]
    public void Mode_namespace_avoids_collision_with_a_flat_set_of_the_same_name()
    {
        // A flat gear set named "TP" wired to a pin AND a mode named "TP": the mode must not clobber the
        // flat set's sets['TP']. The mode's namespace is bumped, and the event reference uses the bumped
        // namespace too (proving both CollectModes call sites agree).
        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id = "t", Type = "trigger:status_change", Data = new() },
                new() { Id = "e", Type = "equip", Data = new() { GearSetId = 50 } },
                Mode("tp", "TP", 10),
            ],
            Edges =
            [
                Edge("t", "Idle", "e"),       // flat set "TP" -> sets['TP']
                Edge("t", "Engaged", "tp"),   // mode "TP" -> bumped namespace
            ],
        };

        var r = GearSwapCodeGenerator.Generate(graph, [Set(50, "TP"), Set(10, "Acc")]);

        Assert.Contains("sets['TP'] = {", r.Lua);                                                  // flat set intact
        Assert.Contains("TP2_Index = 1", r.Lua);                                                   // mode bumped
        Assert.Contains("sets.TP2 = {}", r.Lua);
        Assert.Contains("if new == 'Engaged' then equip(sets.TP2[TP2_Set_Names[TP2_Index]])", r.Lua); // event ref matches def
        Assert.Contains("if command == 'cycle TP set' then", r.Lua);                               // command uses human name
        Assert.DoesNotContain("sets.TP[", r.Lua);                                                  // no un-bumped collision
    }
}
