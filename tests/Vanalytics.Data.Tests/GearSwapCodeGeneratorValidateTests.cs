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

    private static ResolvedGearSet Set16(long id, string name)
    {
        string[] grids = ["Main","Sub","Range","Ammo","Head","Neck","Ear1","Ear2",
                          "Body","Hands","Ring1","Ring2","Back","Waist","Legs","Feet"];
        var slots = grids.Select((g, i) => new ResolvedSlot(g, 100 + i, $"Item{i}", [])).ToList();
        return new ResolvedGearSet(id, name, slots);
    }

    [Fact]
    public void Orphan_node_is_a_warning()
    {
        // a buff node connected to nothing
        var graph = new BlueprintGraphDto
        {
            Nodes = [ Node("t", "trigger:status_change"), Node("e", "equip", new() { GearSetId = 1 }),
                      Node("orphan", "buff", new() { BuffName = "Haste" }) ],
            Edges = [ Edge("t", "Engaged", "e", "in") ],
        };

        var diags = GearSwapCodeGenerator.Validate(graph, [Set(1, "TP")]);

        Assert.Contains(diags, d => d.NodeId == "orphan" && d.Severity == "warning" && d.Message.Contains("isn't connected"));
    }

    [Fact]
    public void Empty_blueprint_is_a_warning()
    {
        var diags = GearSwapCodeGenerator.Validate(new BlueprintGraphDto(), []);
        Assert.Contains(diags, d => d.NodeId == null && d.Severity == "warning" && d.Message.Contains("empty"));
    }

    [Fact]
    public void Zero_member_mode_does_not_also_warn_empty()
    {
        var graph = new BlueprintGraphDto
        {
            Nodes = [ Node("m", "mode", new() { ModeName = "TP", Members = [] }) ],
            Edges = [],
        };

        var diags = GearSwapCodeGenerator.Validate(graph, []);

        Assert.Contains(diags, d => d.NodeId == "m" && d.Message.Contains("member"));
        Assert.DoesNotContain(diags, d => d.Message.Contains("empty"));
    }

    [Fact]
    public void Full_set_used_as_overlay_is_a_warning()
    {
        // equip base set 1 (sparse) + overlay set 2 (full 16-slot)
        var graph = new BlueprintGraphDto
        {
            Nodes = [ Node("t", "trigger:status_change"),
                      Node("e", "equip", new() { GearSetId = 1, OverlaySetIds = [2] }) ],
            Edges = [ Edge("t", "Engaged", "e", "in") ],
        };

        var diags = GearSwapCodeGenerator.Validate(graph, [Set(1, "Base"), Set16(2, "Full")]);

        Assert.Contains(diags, d => d.NodeId == "e" && d.Severity == "warning" && d.Message.Contains("override layer"));
    }

    [Fact]
    public void Trigger_pin_wired_only_to_zero_member_mode_is_a_dead_pin_error()
    {
        // status_change Engaged -> mode with no members (mode itself only warns; the pin produces nothing)
        var graph = new BlueprintGraphDto
        {
            Nodes = [ Node("t", "trigger:status_change"), Node("m", "mode", new() { ModeName = "TP", Members = [] }) ],
            Edges = [ Edge("t", "Engaged", "m", "in") ],
        };

        var diags = GearSwapCodeGenerator.Validate(graph, []);

        Assert.Contains(diags, d => d.NodeId == "t" && d.Severity == "error" && d.Message.Contains("produces nothing"));
    }

    [Fact]
    public void Dead_pin_is_suppressed_when_a_specific_error_already_covers_the_subtree()
    {
        // status_change Engaged -> equip with no set: only the equip's specific error, no dead-pin error
        var graph = new BlueprintGraphDto
        {
            Nodes = [ Node("t", "trigger:status_change"), Node("e", "equip") ],
            Edges = [ Edge("t", "Engaged", "e", "in") ],
        };

        var diags = GearSwapCodeGenerator.Validate(graph, []);

        Assert.Contains(diags, d => d.NodeId == "e" && d.Severity == "error");
        Assert.DoesNotContain(diags, d => d.NodeId == "t");   // no dead-pin error on the trigger
    }

    // ---- spell condition tests ------------------------------------------

    [Fact]
    public void Spell_condition_with_no_value_is_an_error()
    {
        var graph = ReachableSpellGraph(trigger: "trigger:precast", field: "name", value: "");
        var diags = GearSwapCodeGenerator.Validate(graph, NoSets());
        Assert.Contains(diags, d => d.Severity == "error" && d.NodeId == "s"
            && d.Message.Contains("no action/skill/element"));
    }

    [Fact]
    public void Complete_spell_condition_under_precast_is_clean()
    {
        var graph = ReachableSpellGraph(trigger: "trigger:precast", field: "name", value: "Rudra's Storm");
        var diags = GearSwapCodeGenerator.Validate(graph, OneSet());
        Assert.DoesNotContain(diags, d => d.Severity == "error");
    }

    // ---- helpers for spell + future reachability tests ------------------

    // precast --WeaponSkill--> branch(true->equip set1); branch.cond <- spell node "s".
    private static BlueprintGraphDto ReachableSpellGraph(string trigger, string field, string value) => new()
    {
        Nodes =
        {
            new() { Id = "t", Type = trigger },
            new() { Id = "b", Type = "branch" },
            new() { Id = "e", Type = "equip", Data = new() { GearSetId = 1 } },
            new() { Id = "s", Type = "spell", Data = new() { SpellField = field, SpellValue = value } },
        },
        Edges =
        {
            new() { Id = "t-b", Source = "t", SourceHandle = TriggerPin(trigger), Target = "b", TargetHandle = "in" },
            new() { Id = "b-e", Source = "b", SourceHandle = "true", Target = "e", TargetHandle = "in" },
            new() { Id = "s-b", Source = "s", Target = "b", TargetHandle = "cond" },
        },
    };

    // A terminal/category pin that exists on the given trigger (used only to wire the branch).
    private static string TriggerPin(string trigger) => trigger switch
    {
        "trigger:precast"       => "WeaponSkill",
        "trigger:midcast"       => "Ranged",
        "trigger:aftercast"     => "Idle",
        "trigger:status_change" => "Idle",
        "trigger:buff_change"   => "Gained",
        _                       => "Idle",
    };

    private static IReadOnlyCollection<ResolvedGearSet> OneSet() =>
        new[] { new ResolvedGearSet(1, "WS", new List<ResolvedSlot>()) };

    private static IReadOnlyCollection<ResolvedGearSet> NoSets() =>
        Array.Empty<ResolvedGearSet>();

    // ---- Task 5: spell out-of-scope reachability tests ------------------

    [Fact]
    public void Spell_condition_under_status_change_is_out_of_scope_error()
    {
        var graph = ReachableSpellGraph(trigger: "trigger:status_change", field: "name", value: "Rudra's Storm");
        var diags = GearSwapCodeGenerator.Validate(graph, OneSet());
        Assert.Contains(diags, d => d.Severity == "error" && d.NodeId == "s"
            && d.Message.Contains("no spell there"));
    }

    [Fact]
    public void Spell_condition_under_buff_change_is_out_of_scope_error()
    {
        var graph = ReachableSpellGraph(trigger: "trigger:buff_change", field: "name", value: "Rudra's Storm");
        var diags = GearSwapCodeGenerator.Validate(graph, OneSet());
        Assert.Contains(diags, d => d.Severity == "error" && d.NodeId == "s"
            && d.Message.Contains("no spell there"));
    }

    [Fact]
    public void Spell_condition_under_midcast_is_in_scope_clean()
    {
        var graph = ReachableSpellGraph(trigger: "trigger:midcast", field: "name", value: "Rudra's Storm");
        var diags = GearSwapCodeGenerator.Validate(graph, OneSet());
        Assert.DoesNotContain(diags, d => d.NodeId == "s" && d.Message.Contains("no spell there"));
    }

    [Fact]
    public void Spell_condition_through_op_and_is_still_scope_checked()
    {
        // status_change --Idle--> branch; branch.cond <- op:and; op:and.a <- spell "s".
        var graph = new BlueprintGraphDto
        {
            Nodes =
            {
                new() { Id = "t",   Type = "trigger:status_change" },
                new() { Id = "b",   Type = "branch" },
                new() { Id = "e",   Type = "equip", Data = new() { GearSetId = 1 } },
                new() { Id = "and", Type = "op:and" },
                new() { Id = "s",   Type = "spell", Data = new() { SpellField = "name", SpellValue = "Rudra's Storm" } },
                new() { Id = "bf",  Type = "buff",  Data = new() { BuffName = "Sneak Attack" } },
            },
            Edges =
            {
                new() { Id = "t-b",    Source = "t",   SourceHandle = "Idle",   Target = "b",   TargetHandle = "in" },
                new() { Id = "b-e",    Source = "b",   SourceHandle = "true",   Target = "e",   TargetHandle = "in" },
                new() { Id = "and-b",  Source = "and", SourceHandle = "out",    Target = "b",   TargetHandle = "cond" },
                new() { Id = "s-and",  Source = "s",   SourceHandle = "out",    Target = "and", TargetHandle = "a" },
                new() { Id = "bf-and", Source = "bf",  SourceHandle = "out",    Target = "and", TargetHandle = "b" },
            },
        };
        var diags = GearSwapCodeGenerator.Validate(graph, OneSet());
        Assert.Contains(diags, d => d.NodeId == "s" && d.Message.Contains("no spell there"));
    }

    [Fact]
    public void Spell_condition_feeding_only_an_orphan_branch_is_not_scope_error()
    {
        // spell "s" -> branch "b".cond, but "b" is wired to NO trigger (orphan).
        var graph = new BlueprintGraphDto
        {
            Nodes =
            {
                new() { Id = "b", Type = "branch" },
                new() { Id = "e", Type = "equip", Data = new() { GearSetId = 1 } },
                new() { Id = "s", Type = "spell", Data = new() { SpellField = "name", SpellValue = "Rudra's Storm" } },
            },
            Edges =
            {
                new() { Id = "b-e", Source = "b", SourceHandle = "true",  Target = "e", TargetHandle = "in" },
                new() { Id = "s-b", Source = "s", SourceHandle = "out",   Target = "b", TargetHandle = "cond" },
            },
        };
        var diags = GearSwapCodeGenerator.Validate(graph, OneSet());
        Assert.DoesNotContain(diags, d => d.NodeId == "s" && d.Message.Contains("no spell there"));
    }
}
