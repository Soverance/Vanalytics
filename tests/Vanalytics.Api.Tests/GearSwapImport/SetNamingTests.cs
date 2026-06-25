using Vanalytics.Core.Services.GearSwapImport;

namespace Vanalytics.Api.Tests.GearSwapImport;

public class SetNamingTests
{
    private static SetKeySegment Id(string t) => new(t, IsBracket: false);
    private static SetKeySegment Br(string t) => new(t, IsBracket: true);

    [Fact]
    public void Single_qualifier_is_prettified()
    {
        var segs = new[] { Id("engaged") };
        Assert.Equal("Engaged", SetNaming.FriendlyName(segs));
        Assert.Equal("Engaged", SetNaming.Category(segs));
    }

    [Fact]
    public void Trailing_qualifier_becomes_parenthetical()
    {
        var segs = new[] { Id("engaged"), Id("Acc") };
        Assert.Equal("Engaged (Acc)", SetNaming.FriendlyName(segs));
        Assert.Equal("Engaged", SetNaming.Category(segs));
    }

    [Fact]
    public void Idle_pdt_parenthetical()
    {
        var segs = new[] { Id("idle"), Id("PDT") };
        Assert.Equal("Idle (PDT)", SetNaming.FriendlyName(segs));
        Assert.Equal("Idle", SetNaming.Category(segs));
    }

    [Fact]
    public void Bracket_name_uses_nearest_qualifier_prefix()
    {
        var segs = new[] { Id("precast"), Id("WS"), Br("Savage Blade") };
        Assert.Equal("WS: Savage Blade", SetNaming.FriendlyName(segs));
        Assert.Equal("WeaponSkill", SetNaming.Category(segs));
    }

    [Fact]
    public void Midcast_bracket_name()
    {
        var segs = new[] { Id("midcast"), Br("Cure") };
        Assert.Equal("Midcast: Cure", SetNaming.FriendlyName(segs));
        Assert.Equal("Midcast", SetNaming.Category(segs));
    }

    [Fact]
    public void Precast_ja_category()
    {
        var segs = new[] { Id("precast"), Id("JA"), Br("Berserk") };
        Assert.Equal("JA: Berserk", SetNaming.FriendlyName(segs));
        Assert.Equal("JobAbility", SetNaming.Category(segs));
    }

    [Fact]
    public void Unknown_top_level_is_Other_and_title_cased()
    {
        var segs = new[] { Id("myCustomThing") };
        Assert.Equal("MyCustomThing", SetNaming.FriendlyName(segs));
        Assert.Equal("Other", SetNaming.Category(segs));
    }

    // Action sets use a colon regardless of whether the leaf was dotted or bracket-keyed.
    [Fact]
    public void Dotted_action_leaf_uses_colon_like_bracket()
    {
        Assert.Equal("JA: Steal", SetNaming.FriendlyName(new[] { Id("JA"), Id("Steal") }));
        Assert.Equal("JA: Perfect Dodge", SetNaming.FriendlyName(new[] { Id("JA"), Br("Perfect Dodge") }));
        Assert.Equal("WS: Exenterator", SetNaming.FriendlyName(new[] { Id("WS"), Id("Exenterator") }));
    }

    [Fact]
    public void Nested_action_qualifier_is_the_segment_before_the_leaf()
    {
        var segs = new[] { Id("WS"), Id("SA"), Br("Rudra's Storm") };
        Assert.Equal("SA: Rudra's Storm", SetNaming.FriendlyName(segs));
        Assert.Equal("WeaponSkill", SetNaming.Category(segs));
    }

    // Mode-cycle sets use parentheses regardless of dotted vs bracket, and map to Engaged/Idle.
    [Fact]
    public void Tp_variant_is_parenthetical_and_engaged_category()
    {
        var segs = new[] { Id("TP"), Br("Accuracy") };
        Assert.Equal("TP (Accuracy)", SetNaming.FriendlyName(segs));
        Assert.Equal("Engaged", SetNaming.Category(segs));
    }

    [Fact]
    public void Idle_variant_is_parenthetical()
    {
        Assert.Equal("Idle (MDT)", SetNaming.FriendlyName(new[] { Id("Idle"), Id("MDT") }));
        Assert.Equal("Idle (Crafting)", SetNaming.FriendlyName(new[] { Id("Idle"), Id("Crafting") }));
    }
}
