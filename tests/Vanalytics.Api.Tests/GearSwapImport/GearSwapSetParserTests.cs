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

    [Fact]
    public void Resolves_gear_variable_references_in_slot_values()
    {
        const string lua = """
            gear = {}
            gear.Herc_Head = { name="Herculean Helm", augments={'Attack+20',}}
            sets.engaged = { head=gear.Herc_Head, body="Adhemar Jacket +1" }
            """;
        var result = GearSwapSetParser.Parse(lua);
        var set = Assert.Single(result.Sets);
        var head = Assert.Single(set.Slots, s => s.Slot == "Head");
        Assert.Equal("Herculean Helm", head.ItemName);
        Assert.Equal(new[] { "Attack+20" }, head.Augments);
        Assert.Contains(set.Slots, s => s.Slot == "Body" && s.ItemName == "Adhemar Jacket +1");
    }

    [Fact]
    public void Flattens_set_combine_with_rightmost_winning()
    {
        const string lua = """
            sets.engaged = { head="Base Head", body="Base Body" }
            sets.engaged.Acc = set_combine(sets.engaged, { head="Acc Head", hands="Acc Hands" })
            """;
        var result = GearSwapSetParser.Parse(lua);
        var acc = Assert.Single(result.Sets, s => s.LuaKey == "engaged.Acc");
        Assert.Equal("Acc Head", Assert.Single(acc.Slots, s => s.Slot == "Head").ItemName);
        Assert.Equal("Base Body", Assert.Single(acc.Slots, s => s.Slot == "Body").ItemName);
        Assert.Contains(acc.Slots, s => s.Slot == "Hands" && s.ItemName == "Acc Hands");
    }

    [Fact]
    public void Parses_mote_fixture_and_skips_dynamic_set()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "GearSwapImport", "Fixtures", "sample_mote.lua");
        var lua = File.ReadAllText(path);
        var result = GearSwapSetParser.Parse(lua);

        Assert.Contains(result.Sets, s => s.LuaKey == "idle");
        Assert.Contains(result.Sets, s => s.LuaKey == "engaged.Acc"
            && s.Slots.Any(x => x.Slot == "Neck" && x.ItemName == "Combatant's Torque"));
        // Apostrophe set key handled, augmented item resolved via gear.Herc_Feet.
        var ws = Assert.Single(result.Sets, s => s.LuaKey == "precast.WS.Rudra's Storm");
        Assert.Equal("Herculean Boots", Assert.Single(ws.Slots).ItemName);
        // The dynamic set is skipped with a warning, and nothing throws.
        Assert.DoesNotContain(result.Sets, s => s.LuaKey == "engaged.Dynamic");
        Assert.Contains(result.Warnings, w => w.Contains("engaged.Dynamic"));
    }
}
