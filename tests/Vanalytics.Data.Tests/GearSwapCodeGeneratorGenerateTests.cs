// tests/Vanalytics.Data.Tests/GearSwapCodeGeneratorGenerateTests.cs
using Vanalytics.Core.DTOs.Blueprints;
using Vanalytics.Core.Services;

namespace Vanalytics.Data.Tests;

public class GearSwapCodeGeneratorGenerateTests
{
    [Fact]
    public void Empty_graph_emits_valid_minimal_file_with_no_warnings()
    {
        var result = GearSwapCodeGenerator.Generate(
            new BlueprintGraphDto(), sets: []);

        Assert.Contains("function get_sets()", result.Lua);
        Assert.Contains("end", result.Lua);
        Assert.Empty(result.Warnings);
        Assert.DoesNotContain("function precast", result.Lua);
    }

    [Fact]
    public void Equip_node_referencing_missing_set_is_skipped_with_warning()
    {
        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id = "t", Type = "trigger:status_change", Data = new() },
                new() { Id = "e", Type = "equip", Data = new() { GearSetId = 999 } },
            ],
            Edges = [ new() { Id="x", Source="t", SourceHandle="Engaged", Target="e", TargetHandle="in" } ],
        };

        var result = GearSwapCodeGenerator.Generate(graph, sets: []); // set 999 not provided

        Assert.Single(result.Warnings);
        Assert.Contains("999", result.Warnings[0]);
        Assert.DoesNotContain("function status_change", result.Lua); // branch dropped -> no fn
    }

    [Fact]
    public void Full_graph_emits_get_sets_and_wired_events()
    {
        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id="t", Type="trigger:status_change", Data=new() },
                new() { Id="e", Type="equip", Data=new() { GearSetId = 1 } },
            ],
            Edges = [ new() { Id="x", Source="t", SourceHandle="Engaged", Target="e", TargetHandle="in" } ],
        };
        var sets = new[] { new ResolvedGearSet(1, "TP", [new ResolvedSlot("Head", 5, "Hat", [])]) };

        var result = GearSwapCodeGenerator.Generate(graph, sets);

        Assert.Contains("sets['TP'] = {", result.Lua);
        Assert.Contains("head=\"Hat\",", result.Lua);
        Assert.Contains("if new == 'Engaged' then equip(sets['TP'])", result.Lua);
        Assert.Empty(result.Warnings);
    }

    [Fact]
    public void Set_referenced_only_through_a_branch_is_emitted_in_get_sets()
    {
        // status_change Idle -> Branch(HP%<25) ? Defensive : (no false)
        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id="t", Type="trigger:status_change" },
                new() { Id="b", Type="branch" },
                new() { Id="c", Type="cond:stat", Data=new(){ Resource="hpp", Op="<", Value=25 } },
                new() { Id="e", Type="equip", Data=new(){ GearSetId=42 } },
            ],
            Edges =
            [
                new() { Id="t-Idle-b", Source="t", SourceHandle="Idle", Target="b", TargetHandle="in" },
                new() { Id="c-cond-b", Source="c", SourceHandle="out", Target="b", TargetHandle="cond" },
                new() { Id="b-true-e", Source="b", SourceHandle="true", Target="e", TargetHandle="in" },
            ],
        };
        var sets = new List<ResolvedGearSet>
        {
            new(42, "Defensive", [ new ResolvedSlot("Body", 100, "Twilight Mail", []) ]),
        };

        var result = GearSwapCodeGenerator.Generate(graph, sets);

        Assert.Contains("sets['Defensive'] = {", result.Lua);
        Assert.Contains("if player.hpp < 25 then", result.Lua);
        Assert.Contains("equip(sets['Defensive'])", result.Lua);
        Assert.Empty(result.Warnings);
    }
}
