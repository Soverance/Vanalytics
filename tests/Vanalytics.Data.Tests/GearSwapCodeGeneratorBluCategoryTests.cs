using Vanalytics.Core.DTOs.Blueprints;
using Vanalytics.Core.Services;

namespace Vanalytics.Data.Tests;

public class GearSwapCodeGeneratorBluCategoryTests
{
    private static BlueprintGraphDto Graph(BlueprintNodeDto[] nodes, BlueprintEdgeDto[] edges) =>
        new() { Version = 1, Nodes = [.. nodes], Edges = [.. edges] };
    private static BlueprintNodeDto Trigger(string id, string type) => new() { Id = id, Type = type, Data = new() };
    private static BlueprintNodeDto Equip(string id, long setId) => new() { Id = id, Type = "equip", Data = new() { GearSetId = setId } };
    private static BlueprintNodeDto Branch(string id) => new() { Id = id, Type = "branch", Data = new() };
    private static BlueprintNodeDto BluCat(string id, string label, params string[] names) =>
        new() { Id = id, Type = "spell", Data = new() { SpellField = "bluCategory", SpellValue = label, SpellNames = [.. names] } };
    private static BlueprintEdgeDto Exec(string s, string h, string t) =>
        new() { Id = $"{s}-{h}-{t}", Source = s, SourceHandle = h, Target = t, TargetHandle = "in" };
    private static BlueprintEdgeDto Wire(string s, string t, string th) =>
        new() { Id = $"{s}-{th}-{t}", Source = s, SourceHandle = "out", Target = t, TargetHandle = th };

    private static ResolvedGearSet MakeSet(long id, string name) =>
        new(id, name, [new ResolvedSlot("Head", 5, "Hat", [])]);

    [Fact]
    public void BluCategory_condition_references_membership_table()
    {
        var g = Graph(
            [Trigger("t", "trigger:midcast"), Branch("b"), BluCat("c", "Physical (STR)", "Battle Dance", "Foot Kick"), Equip("e", 1)],
            [Exec("t", "Magic", "b"), Wire("c", "b", "cond"), Exec("b", "true", "e")]);
        var lua = GearSwapCodeGenerator.EmitEvents(g, new Dictionary<long, string> { [1] = "Def" });
        Assert.Contains("if blu_cat_physical_str[spell.english] then", lua);
    }

    [Fact]
    public void Generate_emits_one_membership_table_per_used_bucket()
    {
        var g = Graph(
            [Trigger("t", "trigger:midcast"), Branch("b"), BluCat("c", "Physical (STR)", "Battle Dance", "Foot Kick"), Equip("e", 1)],
            [Exec("t", "Magic", "b"), Wire("c", "b", "cond"), Exec("b", "true", "e")]);
        var lua = GearSwapCodeGenerator.Generate(g, [MakeSet(1, "Def")]).Lua;
        Assert.Contains("local blu_cat_physical_str = {", lua);
        Assert.Contains("['Battle Dance']=true", lua);
        Assert.Contains("['Foot Kick']=true", lua);
        Assert.True(lua.IndexOf("local blu_cat_physical_str") < lua.IndexOf("blu_cat_physical_str[spell.english]"));
    }

    [Fact]
    public void Generate_dedupes_same_bucket_used_twice()
    {
        var g = Graph(
            [Trigger("t", "trigger:midcast"), Branch("b1"), Branch("b2"),
             BluCat("c1", "Physical (STR)", "Battle Dance"), BluCat("c2", "Physical (STR)", "Battle Dance"),
             Equip("e1", 1), Equip("e2", 1)],
            [Exec("t", "Magic", "b1"), Wire("c1", "b1", "cond"), Exec("b1", "true", "e1"),
             Exec("b1", "false", "b2"), Wire("c2", "b2", "cond"), Exec("b2", "true", "e2")]);
        var lua = GearSwapCodeGenerator.Generate(g, [MakeSet(1, "Def")]).Lua;
        var first = lua.IndexOf("local blu_cat_physical_str");
        Assert.NotEqual(-1, first);
        Assert.Equal(first, lua.LastIndexOf("local blu_cat_physical_str"));
    }

    [Fact]
    public void Generate_emits_no_preamble_when_no_blu_category()
    {
        var g = Graph(
            [Trigger("t", "trigger:midcast"), Equip("e", 1)],
            [Exec("t", "Magic", "e")]);
        var lua = GearSwapCodeGenerator.Generate(g, [MakeSet(1, "Def")]).Lua;
        Assert.DoesNotContain("blu_cat_", lua);
    }
}
