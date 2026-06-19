// tests/Vanalytics.Data.Tests/GearSwapCodeGeneratorConditionsTests.cs
using Vanalytics.Core.DTOs.Blueprints;
using Vanalytics.Core.Services;

namespace Vanalytics.Data.Tests;

public class GearSwapCodeGeneratorConditionsTests
{
    private static BlueprintGraphDto Graph(BlueprintNodeDto[] nodes, BlueprintEdgeDto[] edges) =>
        new() { Version = 1, Nodes = [.. nodes], Edges = [.. edges] };
    private static BlueprintNodeDto Trigger(string id, string type) => new() { Id = id, Type = type, Data = new() };
    private static BlueprintNodeDto Equip(string id, long setId) => new() { Id = id, Type = "equip", Data = new() { GearSetId = setId } };
    private static BlueprintNodeDto Branch(string id) => new() { Id = id, Type = "branch", Data = new() };
    private static BlueprintNodeDto Buff(string id, string name) => new() { Id = id, Type = "buff", Data = new() { BuffName = name } };
    private static BlueprintNodeDto Value(string id, string resource) => new() { Id = id, Type = "value", Data = new() { Resource = resource } };
    private static BlueprintNodeDto Compare(string id, string? resource, string op, int value) =>
        new() { Id = id, Type = "op:compare", Data = new() { Resource = resource, Op = op, Value = value } };
    private static BlueprintNodeDto Op(string id, string type) => new() { Id = id, Type = type, Data = new() };
    private static BlueprintNodeDto Spell(string id, string? field, string? value) => new() { Id = id, Type = "spell", Data = new() { SpellField = field, SpellValue = value } };

    // exec edge into a target's 'in'
    private static BlueprintEdgeDto Exec(string s, string h, string t) =>
        new() { Id = $"{s}-{h}-{t}", Source = s, SourceHandle = h, Target = t, TargetHandle = "in" };
    // bool/num wire from a source's 'out' into a specific target handle (cond / a / b / in)
    private static BlueprintEdgeDto Wire(string s, string t, string targetHandle) =>
        new() { Id = $"{s}-{targetHandle}-{t}", Source = s, SourceHandle = "out", Target = t, TargetHandle = targetHandle };

    private static string Emit(BlueprintGraphDto g, Dictionary<long, string> names) =>
        GearSwapCodeGenerator.EmitEvents(g, names);

    [Fact]
    public void Buff_node_emits_buffactive()
    {
        var g = Graph(
            [Trigger("t", "trigger:status_change"), Branch("b"), Buff("c", "Sneak Attack"), Equip("e", 1)],
            [Exec("t", "Idle", "b"), Wire("c", "b", "cond"), Exec("b", "true", "e")]);
        var lua = Emit(g, new() { [1] = "Def" });
        Assert.Contains("if buffactive['sneak attack'] then", lua);
        Assert.Contains("equip(sets['Def'])", lua);
    }

    [Fact]
    public void Compare_inline_emits_player_comparison()
    {
        var g = Graph(
            [Trigger("t", "trigger:status_change"), Branch("b"), Compare("c", "hpp", "<", 25), Equip("e", 1)],
            [Exec("t", "Idle", "b"), Wire("c", "b", "cond"), Exec("b", "true", "e")]);
        Assert.Contains("if player.hpp < 25 then", Emit(g, new() { [1] = "Def" }));
    }

    [Fact]
    public void Compare_uses_wired_value_node_over_inline_resource()
    {
        // value(mpp) wired into compare 'in' overrides the inline hpp resource
        var g = Graph(
            [Trigger("t", "trigger:status_change"), Branch("b"),
             Compare("c", "hpp", ">=", 50), Value("v", "mpp"), Equip("e", 1)],
            [Exec("t", "Idle", "b"), Wire("c", "b", "cond"), Wire("v", "c", "in"), Exec("b", "true", "e")]);
        var lua = Emit(g, new() { [1] = "Def" });
        Assert.Contains("if player.mpp >= 50 then", lua);
        Assert.DoesNotContain("player.hpp", lua);
    }

    [Fact]
    public void And_node_combines_two_booleans()
    {
        var g = Graph(
            [Trigger("t", "trigger:status_change"), Branch("b"), Op("and", "op:and"),
             Buff("c1", "Sneak Attack"), Compare("c2", "hpp", "<", 25), Equip("e", 1)],
            [Exec("t", "Idle", "b"), Wire("and", "b", "cond"),
             Wire("c1", "and", "a"), Wire("c2", "and", "b"), Exec("b", "true", "e")]);
        Assert.Contains("if (buffactive['sneak attack'] and player.hpp < 25) then", Emit(g, new() { [1] = "Def" }));
    }

    [Fact]
    public void Or_and_Not_compose()
    {
        // (not buffactive['doom']) or player.hp > 99
        var g = Graph(
            [Trigger("t", "trigger:status_change"), Branch("b"), Op("or", "op:or"), Op("not", "op:not"),
             Buff("d", "Doom"), Compare("c", "hp", ">", 99), Equip("e", 1)],
            [Exec("t", "Idle", "b"), Wire("or", "b", "cond"),
             Wire("not", "or", "a"), Wire("d", "not", "in"), Wire("c", "or", "b"), Exec("b", "true", "e")]);
        Assert.Contains("if ((not buffactive['doom']) or player.hp > 99) then", Emit(g, new() { [1] = "Def" }));
    }

    [Fact]
    public void Incomplete_condition_skips_the_branch()
    {
        // buff node with no name -> null expression -> branch (and its only handle) emits nothing
        var g = Graph(
            [Trigger("t", "trigger:status_change"), Branch("b"), Buff("c", ""), Equip("e", 1)],
            [Exec("t", "Idle", "b"), Wire("c", "b", "cond"), Exec("b", "true", "e")]);
        Assert.DoesNotContain("function status_change", Emit(g, new() { [1] = "Def" }));
    }

    // ── spell node condition tests ────────────────────────────────────────────

    [Fact]
    public void Spell_name_condition_emits_spell_english_equality()
    {
        var lua = GenerateWithSpellCond(field: "name", value: "Rudra's Storm");
        Assert.Contains("spell.english == 'Rudra\\'s Storm'", lua);
    }

    [Fact]
    public void Spell_skill_condition_emits_spell_skill_equality()
    {
        var lua = GenerateWithSpellCond(field: "skill", value: "Elemental Magic");
        Assert.Contains("spell.skill == 'Elemental Magic'", lua);
    }

    [Fact]
    public void Spell_element_condition_emits_spell_element_equality()
    {
        var lua = GenerateWithSpellCond(field: "element", value: "Fire");
        Assert.Contains("spell.element == 'Fire'", lua);
    }

    [Fact]
    public void Spell_condition_value_is_not_case_folded()
    {
        var lua = GenerateWithSpellCond(field: "name", value: "Mercy Stroke");
        Assert.Contains("spell.english == 'Mercy Stroke'", lua);   // verbatim, not lowercased
    }

    [Fact]
    public void Spell_condition_with_blank_value_emits_no_branch()
    {
        var lua = GenerateWithSpellCond(field: "name", value: "");
        Assert.DoesNotContain("spell.english", lua);   // incomplete cond → branch emits nothing
    }

    [Fact]
    public void Spell_condition_with_unknown_field_emits_no_branch()
    {
        var lua = GenerateWithSpellCond(field: "bogus", value: "Fire");
        Assert.DoesNotContain("spell.", lua);
    }

    [Fact]
    public void Spell_condition_with_null_field_emits_no_branch()
    {
        var lua = GenerateWithSpellCond(field: null, value: "Fire");
        Assert.DoesNotContain("spell.", lua);
    }

    [Fact]
    public void Spell_contains_condition_emits_plain_string_find()
    {
        var lua = GenerateWithSpellCond(field: "contains", value: "Waltz");
        Assert.Contains("string.find(spell.english, 'Waltz', 1, true)", lua);
    }

    [Fact]
    public void Spell_contains_hyphen_family_is_emitted_as_plain_literal()
    {
        // 'Indi-' contains '-', a Lua pattern metacharacter. The plain flag (1, true) makes string.find
        // do a literal substring search so the hyphen matches literally, not as a pattern.
        var lua = GenerateWithSpellCond(field: "contains", value: "Indi-");
        Assert.Contains("string.find(spell.english, 'Indi-', 1, true)", lua);
    }

    [Fact]
    public void Spell_contains_with_blank_value_emits_nothing()
    {
        var lua = GenerateWithSpellCond(field: "contains", value: "");
        Assert.DoesNotContain("string.find", lua);
    }

    // Builds: precast --WeaponSkill--> branch --true--> equip(set 1); branch.cond <- spell node.
    private static string GenerateWithSpellCond(string? field, string value)
    {
        var g = Graph(
            [Trigger("t", "trigger:precast"), Branch("b"), Equip("e", 1), Spell("s", field, value)],
            [
                Exec("t", "WeaponSkill", "b"),
                Exec("b", "true", "e"),
                Wire("s", "b", "cond"),
            ]);
        return Emit(g, new() { [1] = "WS" });
    }
}
