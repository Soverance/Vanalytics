// tests/Vanalytics.Data.Tests/GearSwapCodeGeneratorOverlayTests.cs
using Vanalytics.Core.DTOs.Blueprints;
using Vanalytics.Core.Services;

namespace Vanalytics.Data.Tests;

public class GearSwapCodeGeneratorOverlayTests
{
    private static ResolvedGearSet Set(long id, string name) =>
        new(id, name, [new ResolvedSlot("Head", 100 + (int)id, $"Hat{id}", [])]);

    private static BlueprintEdgeDto Edge(string src, string handle, string tgt) =>
        new() { Id = $"{src}-{handle}-{tgt}", Source = src, SourceHandle = handle, Target = tgt, TargetHandle = "in" };

    private static BlueprintNodeDto Equip(string id, long? baseId, long[]? overlays = null, string? action = null) =>
        new() { Id = id, Type = "equip", Data = new() { GearSetId = baseId, OverlaySetIds = overlays?.ToList(), ActionName = action } };

    [Fact]
    public void EquipExpr_one_set_is_plain_reference()
    {
        var names = new Dictionary<long, string> { [10] = "Accuracy" };
        Assert.Equal("sets['Accuracy']", GearSwapCodeGenerator.EquipExpr(10, null, names));
    }

    [Fact]
    public void EquipExpr_base_plus_overlay_is_set_combine_right_most_wins()
    {
        var names = new Dictionary<long, string> { [10] = "Accuracy", [11] = "TH Swap" };
        Assert.Equal("set_combine(sets['Accuracy'], sets['TH Swap'])",
            GearSwapCodeGenerator.EquipExpr(10, [11], names));
    }

    [Fact]
    public void EquipExpr_drops_unresolved_and_degrades_to_plain()
    {
        var names = new Dictionary<long, string> { [10] = "Accuracy" };
        Assert.Equal("sets['Accuracy']", GearSwapCodeGenerator.EquipExpr(10, [999], names));
    }

    [Fact]
    public void EquipExpr_null_when_nothing_resolves()
    {
        var names = new Dictionary<long, string>();
        Assert.Null(GearSwapCodeGenerator.EquipExpr(10, [11], names));
        Assert.Null(GearSwapCodeGenerator.EquipExpr(null, null, names));
    }

    [Fact]
    public void Terminal_pin_to_layered_equip_emits_set_combine_and_top_level_sets()
    {
        var graph = new BlueprintGraphDto
        {
            Nodes = [ new() { Id = "t", Type = "trigger:status_change", Data = new() }, Equip("e", 10, [11]) ],
            Edges = [ Edge("t", "Idle", "e") ],
        };

        var r = GearSwapCodeGenerator.Generate(graph, [Set(10, "Idle Base"), Set(11, "MDT Swap")]);

        Assert.Contains("sets['Idle Base'] = {", r.Lua);
        Assert.Contains("sets['MDT Swap'] = {", r.Lua);
        Assert.Contains("if new == 'Idle' then equip(set_combine(sets['Idle Base'], sets['MDT Swap']))", r.Lua);
        Assert.Empty(r.Warnings);
    }

    [Fact]
    public void Plain_terminal_equip_is_unchanged()
    {
        var graph = new BlueprintGraphDto
        {
            Nodes = [ new() { Id = "t", Type = "trigger:status_change", Data = new() }, Equip("e", 10) ],
            Edges = [ Edge("t", "Idle", "e") ],
        };

        var r = GearSwapCodeGenerator.Generate(graph, [Set(10, "Idle Base")]);

        Assert.Contains("if new == 'Idle' then equip(sets['Idle Base'])", r.Lua);
        Assert.DoesNotContain("set_combine", r.Lua);
    }

    [Fact]
    public void Category_pin_action_leaf_with_overlay_emits_set_combine_in_dispatch()
    {
        var graph = new BlueprintGraphDto
        {
            Nodes = [ new() { Id = "t", Type = "trigger:precast", Data = new() }, Equip("a", 10, [11], action: "Sneak Attack") ],
            Edges = [ Edge("t", "JobAbility", "a") ],
        };

        var r = GearSwapCodeGenerator.Generate(graph, [Set(10, "TP"), Set(11, "SA Gloves")]);

        Assert.Contains("sets['TP'] = {", r.Lua);
        Assert.Contains("sets['SA Gloves'] = {", r.Lua);
        Assert.Contains("if spell.type == 'JobAbility' then", r.Lua);
        Assert.Contains("if spell.english == 'Sneak Attack' then equip(set_combine(sets['TP'], sets['SA Gloves']))", r.Lua);
        Assert.Empty(r.Warnings);
    }

    [Fact]
    public void Mode_member_with_overlay_emits_set_combine_assignment()
    {
        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new()
                {
                    Id = "tp", Type = "mode",
                    Data = new()
                    {
                        ModeName = "TP",
                        Members =
                        [
                            new BlueprintModeMemberDto { GearSetId = 10 },
                            new BlueprintModeMemberDto { GearSetId = 10, OverlaySetIds = [11], Label = "Treasure Hunter" },
                        ],
                    },
                },
            ],
            Edges = [],
        };

        var r = GearSwapCodeGenerator.Generate(graph, [Set(10, "Accuracy"), Set(11, "TH Swap")]);

        Assert.Contains("sets['Accuracy'] = {", r.Lua);
        Assert.Contains("sets['TH Swap'] = {", r.Lua);
        Assert.Contains("sets.TP['Accuracy'] = {", r.Lua);
        Assert.Contains("sets.TP['Treasure Hunter'] = set_combine(sets['Accuracy'], sets['TH Swap'])", r.Lua);
        Assert.Empty(r.Warnings);
    }

    [Fact]
    public void Layered_equip_with_deleted_overlay_warns_and_degrades_to_plain()
    {
        var graph = new BlueprintGraphDto
        {
            Nodes = [ new() { Id = "t", Type = "trigger:status_change", Data = new() }, Equip("e", 10, [999]) ],
            Edges = [ Edge("t", "Idle", "e") ],
        };

        var r = GearSwapCodeGenerator.Generate(graph, [Set(10, "Idle Base")]);   // overlay 999 missing

        Assert.Contains(r.Warnings, w => w.Contains("999"));
        Assert.Contains("if new == 'Idle' then equip(sets['Idle Base'])", r.Lua);   // degraded to plain
        Assert.DoesNotContain("set_combine", r.Lua);
    }

    [Fact]
    public void Mode_member_with_all_overlays_deleted_warns_and_degrades_to_inline()
    {
        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id = "tp", Type = "mode", Data = new()
                    { ModeName = "TP", Members = [ new BlueprintModeMemberDto { GearSetId = 10, OverlaySetIds = [999], Label = "Treasure Hunter" } ] } },
            ],
            Edges = [],
        };

        var r = GearSwapCodeGenerator.Generate(graph, [Set(10, "Accuracy")]);   // overlay 999 missing

        Assert.Contains(r.Warnings, w => w.Contains("999"));
        Assert.Contains("sets.TP['Treasure Hunter'] = {", r.Lua);   // degraded to inline slot table, not broken set_combine
        Assert.DoesNotContain("sets.TP['Treasure Hunter'] = set_combine", r.Lua);
        Assert.DoesNotContain("sets.TP['Treasure Hunter'] = \n", r.Lua);   // not a broken empty RHS
    }
}
