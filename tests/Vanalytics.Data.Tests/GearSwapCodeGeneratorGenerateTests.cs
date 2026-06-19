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
                new() { Id="c", Type="op:compare", Data=new(){ Resource="hpp", Op="<", Value=25 } },
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

    [Fact]
    public void Golden_sata_precast_full_file()
    {
        // precast WeaponSkill -> Branch(SA) ? (Branch(TA) ? SATA : SA) : WSdefault
        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id="t", Type="trigger:precast" },
                new() { Id="bSA", Type="branch" }, new() { Id="cSA", Type="buff", Data=new(){ BuffName="Sneak Attack" } },
                new() { Id="bTA", Type="branch" }, new() { Id="cTA", Type="buff", Data=new(){ BuffName="Trick Attack" } },
                new() { Id="eSATA", Type="equip", Data=new(){ GearSetId=1 } },
                new() { Id="eSA",   Type="equip", Data=new(){ GearSetId=2 } },
                new() { Id="eDef",  Type="equip", Data=new(){ GearSetId=3 } },
            ],
            Edges =
            [
                new() { Id="t-WeaponSkill-bSA", Source="t", SourceHandle="WeaponSkill", Target="bSA", TargetHandle="in" },
                new() { Id="cSA-cond-bSA", Source="cSA", SourceHandle="out", Target="bSA", TargetHandle="cond" },
                new() { Id="bSA-true-bTA",  Source="bSA", SourceHandle="true",  Target="bTA",  TargetHandle="in" },
                new() { Id="bSA-false-eDef", Source="bSA", SourceHandle="false", Target="eDef", TargetHandle="in" },
                new() { Id="cTA-cond-bTA", Source="cTA", SourceHandle="out", Target="bTA", TargetHandle="cond" },
                new() { Id="bTA-true-eSATA", Source="bTA", SourceHandle="true",  Target="eSATA", TargetHandle="in" },
                new() { Id="bTA-false-eSA",  Source="bTA", SourceHandle="false", Target="eSA",   TargetHandle="in" },
            ],
        };
        var sets = new List<ResolvedGearSet>
        {
            new(1, "WS SATA", [ new ResolvedSlot("Hands", 10, "Adhemar Wristbands", []) ]),
            new(2, "WS SA",   [ new ResolvedSlot("Hands", 11, "Plunderer's Armlets", []) ]),
            new(3, "WS",      [ new ResolvedSlot("Head", 12, "Adhemar Bonnet", []) ]),
        };

        var lua = GearSwapCodeGenerator.Generate(graph, sets).Lua;

        var expected =
@"function precast(spell)
    if spell.type == 'WeaponSkill' then
        if buffactive['sneak attack'] then
            if buffactive['trick attack'] then
                equip(sets['WS SATA'])
            else
                equip(sets['WS SA'])
            end
        else
            equip(sets['WS'])
        end
    end
end";
        Assert.Contains(expected.Replace("\r\n", "\n"), lua.Replace("\r\n", "\n"));
    }

    [Fact]
    public void Spell_and_buff_compose_into_nested_precast_guard()
    {
        // precast WeaponSkill -> Branch(spell.english=='Rudra\'s Storm' AND buffactive['sneak attack']) ? WS
        var graph = new BlueprintGraphDto
        {
            Nodes =
            [
                new() { Id="t",   Type="trigger:precast" },
                new() { Id="b",   Type="branch" },
                new() { Id="and", Type="op:and" },
                new() { Id="sp",  Type="spell", Data=new(){ SpellField="name", SpellValue="Rudra's Storm" } },
                new() { Id="bf",  Type="buff",  Data=new(){ BuffName="Sneak Attack" } },
                new() { Id="e",   Type="equip", Data=new(){ GearSetId=1 } },
            ],
            Edges =
            [
                new() { Id="t-WeaponSkill-b", Source="t",   SourceHandle="WeaponSkill", Target="b",   TargetHandle="in" },
                new() { Id="and-out-b",       Source="and", SourceHandle="out",         Target="b",   TargetHandle="cond" },
                new() { Id="sp-out-and-a",    Source="sp",  SourceHandle="out",         Target="and", TargetHandle="a" },
                new() { Id="bf-out-and-b",    Source="bf",  SourceHandle="out",         Target="and", TargetHandle="b" },
                new() { Id="b-true-e",        Source="b",   SourceHandle="true",        Target="e",   TargetHandle="in" },
            ],
        };
        var sets = new List<ResolvedGearSet>
        {
            new(1, "WS", [ new ResolvedSlot("Hands", 10, "Adhemar Wristbands", []) ]),
        };

        var lua = GearSwapCodeGenerator.Generate(graph, sets).Lua;

        Assert.Contains("spell.type == 'WeaponSkill'", lua);
        Assert.Contains("(spell.english == 'Rudra\\'s Storm' and buffactive['sneak attack'])", lua);
    }
}
