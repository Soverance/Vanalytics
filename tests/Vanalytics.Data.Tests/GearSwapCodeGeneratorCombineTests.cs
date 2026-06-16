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

    [Fact]
    public void Mode_member_referencing_combine_emits_set_combine_assignment()
    {
        // TP mode: member 1 = flat "Accuracy"; member 2 = combine(Accuracy, TH Swap) labelled "Treasure Hunter".
        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                Combine("c", 10, 11),
                new()
                {
                    Id = "tp", Type = "mode",
                    Data = new()
                    {
                        ModeName = "TP",
                        Members =
                        [
                            new BlueprintModeMemberDto { GearSetId = 10 },
                            new BlueprintModeMemberDto { CombineNodeId = "c", Label = "Treasure Hunter" },
                        ],
                    },
                },
            ],
            Edges = [],
        };

        var r = GearSwapCodeGenerator.Generate(graph, [Set(10, "Accuracy"), Set(11, "TH Swap")]);

        // Components emitted as top-level sets (so set_combine can reference them).
        Assert.Contains("sets['Accuracy'] = {", r.Lua);
        Assert.Contains("sets['TH Swap'] = {", r.Lua);
        // Flat member inlines its slots; combine member is an assignment to set_combine.
        Assert.Contains("sets.TP['Accuracy'] = {", r.Lua);
        Assert.Contains("sets.TP['Treasure Hunter'] = set_combine(sets['Accuracy'], sets['TH Swap'])", r.Lua);
        Assert.Contains("TP_Set_Names = {'Accuracy', 'Treasure Hunter'}", r.Lua);
        Assert.Empty(r.Warnings);
    }

    [Fact]
    public void Combine_member_label_falls_back_to_base_set_name()
    {
        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                Combine("c", 10, 11),
                new() { Id = "tp", Type = "mode", Data = new()
                    { ModeName = "TP", Members = [ new BlueprintModeMemberDto { CombineNodeId = "c" } ] } },
            ],
            Edges = [],
        };

        var r = GearSwapCodeGenerator.Generate(graph, [Set(10, "Accuracy"), Set(11, "TH Swap")]);

        // No explicit label -> uses the base (first) component's set name.
        Assert.Contains("sets.TP['Accuracy'] = set_combine(sets['Accuracy'], sets['TH Swap'])", r.Lua);
    }

    [Fact]
    public void Combine_with_deleted_component_warns_and_skips_when_under_two_remain()
    {
        var graph = new BlueprintGraphDto
        {
            Nodes = [ new() { Id = "t", Type = "trigger:status_change", Data = new() }, Combine("c", 10, 999) ],
            Edges = [ Edge("t", "Idle", "c") ],
        };

        var r = GearSwapCodeGenerator.Generate(graph, [Set(10, "Idle Base")]);   // 999 missing

        Assert.Contains(r.Warnings, w => w.Contains("999"));
        Assert.Contains(r.Warnings, w => w.Contains("at least 2 gear sets"));
        Assert.DoesNotContain("set_combine", r.Lua);   // combine skipped -> no Idle arm
        Assert.DoesNotContain("function status_change", r.Lua);
    }

    [Fact]
    public void Golden_tp_mode_with_layered_treasure_hunter_member()
    {
        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id = "t", Type = "trigger:status_change", Data = new() },
                Combine("c", 10, 11),
                new()
                {
                    Id = "tp", Type = "mode",
                    Data = new()
                    {
                        ModeName = "TP",
                        Members =
                        [
                            new BlueprintModeMemberDto { GearSetId = 10 },
                            new BlueprintModeMemberDto { CombineNodeId = "c", Label = "Treasure Hunter" },
                        ],
                    },
                },
            ],
            Edges = [ Edge("t", "Engaged", "tp") ],
        };

        var r = GearSwapCodeGenerator.Generate(graph, [Set(10, "Accuracy"), Set(11, "TH Swap")]);

        var expected =
            "-- Generated by Vanalytics. Edits will be overwritten on regenerate.\n\n" +
            "function get_sets()\n" +
            "    sets['Accuracy'] = {\n        head=\"Hat10\",\n    }\n" +
            "    sets['TH Swap'] = {\n        head=\"Hat11\",\n    }\n" +
            "    TP_Index = 1\n" +
            "    TP_Set_Names = {'Accuracy', 'Treasure Hunter'}\n" +
            "    sets.TP = {}\n" +
            "    sets.TP['Accuracy'] = {\n        head=\"Hat10\",\n    }\n" +
            "    sets.TP['Treasure Hunter'] = set_combine(sets['Accuracy'], sets['TH Swap'])\n" +
            "end\n\n" +
            "function status_change(new, old)\n" +
            "    if new == 'Engaged' then equip(sets.TP[TP_Set_Names[TP_Index]])\n" +
            "    end\n" +
            "end\n\n" +
            "-- Bind these in an in-game macro (one line each):\n" +
            "--   /console gs c cycle TP set\n" +
            "function self_command(command)\n" +
            "    if command == 'cycle TP set' then\n" +
            "        TP_Index = TP_Index + 1\n" +
            "        if TP_Index > #TP_Set_Names then TP_Index = 1 end\n" +
            "        send_command('@input /echo ----- TP Set changed to '..TP_Set_Names[TP_Index]..' -----')\n" +
            "        equip(sets.TP[TP_Set_Names[TP_Index]])\n" +
            "    end\nend\n";

        Assert.Equal(expected, r.Lua);
    }
}
