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

    private static BlueprintNodeDto Branch(string id) =>
        new() { Id = id, Type = "branch", Data = new() };

    private static BlueprintNodeDto CondBuff(string id, string buffName) =>
        new() { Id = id, Type = "buff", Data = new() { BuffName = buffName } };

    // A single op:compare with an inline resource is the 1-node equivalent of the old cond:stat.
    private static BlueprintNodeDto CondStat(string id, string resource, string op, int value) =>
        new() { Id = id, Type = "op:compare", Data = new() { Resource = resource, Op = op, Value = value } };

    // Exec edge from a branch True/False (or any) out handle to a target's 'in'.
    private static BlueprintEdgeDto ExecEdge(string source, string handle, string target) =>
        new() { Id = $"{source}-{handle}-{target}", Source = source, SourceHandle = handle, Target = target, TargetHandle = "in" };

    // Condition (data) edge: a cond node's 'out' into a branch's 'cond' input.
    private static BlueprintEdgeDto CondEdge(string condId, string branchId) =>
        new() { Id = $"{condId}-cond-{branchId}", Source = condId, SourceHandle = "out", Target = branchId, TargetHandle = "cond" };

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

    [Fact]
    public void Branch_with_buff_condition_emits_if_else()
    {
        // status_change Idle -> Branch(buffactive['sneak attack']) ? Defense : Idle
        var graph = Graph(
            [Trigger("t","trigger:status_change"), Branch("b"), CondBuff("c","Sneak Attack"),
             Equip("e1",1), Equip("e2",2)],
            [Edge("t","Idle","b"), CondEdge("c","b"),
             ExecEdge("b","true","e1"), ExecEdge("b","false","e2")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, new Dictionary<long,string>{[1]="Defense",[2]="Idle"});

        Assert.Contains("    if new == 'Idle' then", lua);
        Assert.Contains("        if buffactive['sneak attack'] then", lua);
        Assert.Contains("            equip(sets['Defense'])", lua);
        Assert.Contains("        else", lua);
        Assert.Contains("            equip(sets['Idle'])", lua);
        Assert.Contains("        end", lua);
    }

    [Fact]
    public void Chained_branches_nest_as_logical_and()
    {
        // precast WeaponSkill -> Branch(SA) ? [ Branch(TA) ? SATA : SA ] : WSdefault
        var graph = Graph(
            [Trigger("t","trigger:precast"),
             Branch("bSA"), CondBuff("cSA","Sneak Attack"),
             Branch("bTA"), CondBuff("cTA","Trick Attack"),
             Equip("eSATA",6), Equip("eSA",1), Equip("eDef",2)],
            [Edge("t","WeaponSkill","bSA"), CondEdge("cSA","bSA"),
             ExecEdge("bSA","true","bTA"), ExecEdge("bSA","false","eDef"),
             CondEdge("cTA","bTA"),
             ExecEdge("bTA","true","eSATA"), ExecEdge("bTA","false","eSA")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph,
            new Dictionary<long,string>{[6]="SATA",[1]="SA",[2]="WS"});

        Assert.Contains("    if spell.type == 'WeaponSkill' then", lua);
        Assert.Contains("        if buffactive['sneak attack'] then", lua);
        Assert.Contains("            if buffactive['trick attack'] then", lua);
        Assert.Contains("                equip(sets['SATA'])", lua);
        Assert.Contains("                equip(sets['SA'])", lua);   // inner else
        Assert.Contains("        else", lua);                          // outer else (SA false)
        Assert.Contains("            equip(sets['WS'])", lua);
    }

    [Fact]
    public void Branch_with_stat_condition_emits_player_comparison()
    {
        var graph = Graph(
            [Trigger("t","trigger:status_change"), Branch("b"), CondStat("c","hpp","<",25),
             Equip("e1",1), Equip("e2",2)],
            [Edge("t","Idle","b"), CondEdge("c","b"),
             ExecEdge("b","true","e1"), ExecEdge("b","false","e2")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, new Dictionary<long,string>{[1]="Def",[2]="Idle"});

        Assert.Contains("if player.hpp < 25 then", lua);
        Assert.Contains("equip(sets['Def'])", lua);
        Assert.Contains("equip(sets['Idle'])", lua);
    }

    [Fact]
    public void Branch_without_condition_is_skipped()
    {
        var graph = Graph(
            [Trigger("t","trigger:status_change"), Branch("b"), Equip("e1",1)],
            [Edge("t","Idle","b"), ExecEdge("b","true","e1")]);   // no CondEdge

        var lua = GearSwapCodeGenerator.EmitEvents(graph, new Dictionary<long,string>{[1]="Def"});

        Assert.DoesNotContain("function status_change", lua);   // the only handle yields nothing
    }

    [Fact]
    public void Branch_true_only_omits_else_clause()
    {
        // Only a True target -> no else clause (False is "do nothing / keep current gear").
        var graph = Graph(
            [Trigger("t","trigger:status_change"), Branch("b"), CondStat("c","hp",">",99),
             Equip("e1",1)],
            [Edge("t","Idle","b"), CondEdge("c","b"), ExecEdge("b","true","e1")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, new Dictionary<long,string>{[1]="Frenzy"});

        Assert.Contains("if player.hp > 99 then", lua);
        Assert.Contains("equip(sets['Frenzy'])", lua);
        Assert.DoesNotContain("else", lua);
    }

    [Fact]
    public void PetChange_summoned_and_released_terminal_equip()
    {
        var graph = Graph(
            [Trigger("t","trigger:pet_change"), Equip("e1",1), Equip("e2",2)],
            [Edge("t","Summoned","e1"), Edge("t","Released","e2")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("function pet_change(pet, gain)", lua);
        Assert.Contains("if gain then equip(sets['TP Accuracy'])", lua);
        Assert.Contains("elseif not gain then equip(sets['Idle Default'])", lua);
    }

    [Fact]
    public void PetStatusChange_emits_if_elseif_on_new_status()
    {
        var graph = Graph(
            [Trigger("t","trigger:pet_status_change"), Equip("e1",1), Equip("e2",2)],
            [Edge("t","Engaged","e1"), Edge("t","Idle","e2")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("function pet_status_change(new, old)", lua);
        Assert.Contains("if new == 'Engaged' then equip(sets['TP Accuracy'])", lua);
        Assert.Contains("elseif new == 'Idle' then equip(sets['Idle Default'])", lua);
    }

    [Fact]
    public void PetAftercast_uses_player_status()
    {
        var graph = Graph(
            [Trigger("t","trigger:pet_aftercast"), Equip("e1",1), Equip("e2",2)],
            [Edge("t","Engaged","e1"), Edge("t","Idle","e2")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("function pet_aftercast(spell)", lua);
        Assert.Contains("if player.status == 'Engaged' then equip(sets['TP Accuracy'])", lua);
        Assert.Contains("elseif player.status ~= 'Engaged' then equip(sets['Idle Default'])", lua);
    }

    [Fact]
    public void PetMidcast_named_plus_generic_dispatches_without_if_true()
    {
        var graph = Graph(
            [Trigger("t","trigger:pet_midcast"), EquipNamed("e1",4,"Searing Light"), Equip("e2",2)],
            [Edge("t","PetAction","e1"), Edge("t","PetAction","e2")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("function pet_midcast(spell)", lua);
        Assert.Contains("    if spell.english == 'Searing Light' then equip(sets['Cure Set'])", lua);
        Assert.Contains("    else equip(sets['Idle Default'])", lua);
        Assert.DoesNotContain("if true", lua);
    }

    [Fact]
    public void PetMidcast_generic_only_emits_bare_equip_no_if_true()
    {
        var graph = Graph(
            [Trigger("t","trigger:pet_midcast"), Equip("e",2)],
            [Edge("t","PetAction","e")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, Names);

        Assert.Contains("function pet_midcast(spell)\n    equip(sets['Idle Default'])\nend", lua);
        Assert.DoesNotContain("if true", lua);
        Assert.DoesNotContain("spell.english", lua);
    }

    [Fact]
    public void PetMidcast_wired_to_branch_emits_condition_at_function_body_indent()
    {
        // pet_midcast PetAction -> Branch(buffactive['sneak attack']) ? Pet Hybrid : Pet Idle
        // GuardlessCategoryBody calls EmitExec at depth 1 (4-space pad), so the `if` line is at
        // 4 spaces and the equip lines inside the branch body are at 8 spaces.
        var graph = Graph(
            [Trigger("t","trigger:pet_midcast"), Branch("b"), CondBuff("c","Sneak Attack"),
             Equip("e1",1), Equip("e2",2)],
            [Edge("t","PetAction","b"), CondEdge("c","b"),
             ExecEdge("b","true","e1"), ExecEdge("b","false","e2")]);

        var lua = GearSwapCodeGenerator.EmitEvents(graph, new Dictionary<long,string>{[1]="Pet Hybrid",[2]="Pet Idle"});

        Assert.Contains("function pet_midcast(spell)", lua);
        Assert.Contains("    if buffactive['sneak attack'] then", lua);
        Assert.Contains("        equip(sets['Pet Hybrid'])", lua);
        Assert.Contains("    else", lua);
        Assert.Contains("        equip(sets['Pet Idle'])", lua);
        Assert.Contains("    end", lua);
        Assert.DoesNotContain("if true", lua);
    }
}
