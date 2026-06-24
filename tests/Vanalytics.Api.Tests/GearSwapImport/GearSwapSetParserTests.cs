using Vanalytics.Core.Services.GearSwapImport;

namespace Vanalytics.Api.Tests.GearSwapImport;

public class GearSwapSetParserTests
{
    [Fact]
    public void Finds_a_single_flat_set_with_one_slot()
    {
        const string lua = """
            sets.engaged = { head="Adhemar Bonnet +1" }
            """;
        var result = GearSwapSetParser.Parse(lua);

        var set = Assert.Single(result.Sets);
        Assert.Equal("engaged", set.LuaKey);
        Assert.Equal("Engaged", set.FriendlyName);
        Assert.Equal("Engaged", set.Category);
        var slot = Assert.Single(set.Slots);
        Assert.Equal("Head", slot.Slot);
        Assert.Equal("Adhemar Bonnet +1", slot.ItemName);
        Assert.Empty(slot.Augments);
    }

    [Fact]
    public void Parses_augmented_item_in_emitted_format()
    {
        // Matches the forward compiler's emission shape exactly.
        const string lua = """
            sets.precast.WS['Savage Blade'] = { legs={ name="Plun. Culottes +1", augments={'Enhances "Feint" effect',}} }
            """;
        var result = GearSwapSetParser.Parse(lua);
        var set = Assert.Single(result.Sets);
        Assert.Equal("precast.WS.Savage Blade", set.LuaKey);
        Assert.Equal("WS: Savage Blade", set.FriendlyName);
        Assert.Equal("WeaponSkill", set.Category);
        var slot = Assert.Single(set.Slots);
        Assert.Equal("Legs", slot.Slot);
        Assert.Equal("Plun. Culottes +1", slot.ItemName);
        Assert.Equal(new[] { "Enhances \"Feint\" effect" }, slot.Augments);
    }

    [Fact]
    public void Parses_all_sixteen_slot_keys()
    {
        const string lua = """
            sets.idle = {
              main="A", sub="B", range="C", ammo="D",
              head="E", neck="F", left_ear="G", right_ear="H",
              body="I", hands="J", left_ring="K", right_ring="L",
              back="M", waist="N", legs="O", feet="P",
            }
            """;
        var result = GearSwapSetParser.Parse(lua);
        var set = Assert.Single(result.Sets);
        Assert.Equal(16, set.Slots.Count);
        Assert.Contains(set.Slots, s => s.Slot == "Ear1" && s.ItemName == "G");
        Assert.Contains(set.Slots, s => s.Slot == "Ring2" && s.ItemName == "L");
    }

    [Fact]
    public void Ignores_non_slot_keys()
    {
        const string lua = """sets.idle = { head="A", priority=5, foo="bar" }""";
        var result = GearSwapSetParser.Parse(lua);
        var set = Assert.Single(result.Sets);
        Assert.Single(set.Slots);
        Assert.Equal("Head", set.Slots[0].Slot);
    }
}
