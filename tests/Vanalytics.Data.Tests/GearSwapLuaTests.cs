// tests/Vanalytics.Data.Tests/GearSwapLuaTests.cs
using Vanalytics.Core.Services;

namespace Vanalytics.Data.Tests;

public class GearSwapLuaTests
{
    [Fact]
    public void Name_is_double_quoted_and_escapes_backslash_then_quote()
    {
        Assert.Equal("\"Adhemar Bonnet +1\"", GearSwapLua.Name("Adhemar Bonnet +1"));
        Assert.Equal("\"a\\\\b\"", GearSwapLua.Name("a\\b"));
        Assert.Equal("\"say \\\"hi\\\"\"", GearSwapLua.Name("say \"hi\""));
    }

    [Fact]
    public void Augment_is_single_quoted_and_escapes_apostrophe()
    {
        Assert.Equal("'Enhances \"Feint\" effect'", GearSwapLua.Augment("Enhances \"Feint\" effect"));
        Assert.Equal("'Assassin\\'s Charge'", GearSwapLua.Augment("Assassin's Charge"));
    }

    [Fact]
    public void Key_is_single_quoted_for_bracket_form()
    {
        Assert.Equal("'Rudra\\'s Storm'", GearSwapLua.Key("Rudra's Storm"));
    }

    [Fact]
    public void Newlines_collapse_to_spaces()
    {
        Assert.Equal("\"a b\"", GearSwapLua.Name("a\r\nb"));
    }

    [Fact]
    public void Ident_keeps_simple_names()
    {
        Assert.Equal("TP", GearSwapLua.Ident("TP"));
        Assert.Equal("Idle", GearSwapLua.Ident("Idle"));
    }

    [Fact]
    public void Ident_strips_spaces_and_punctuation()
    {
        Assert.Equal("RangedTP", GearSwapLua.Ident("Ranged TP"));
        Assert.Equal("RangedTP", GearSwapLua.Ident("Ranged-TP"));
    }

    [Fact]
    public void Ident_prefixes_underscore_when_starting_with_digit()
    {
        Assert.Equal("_2HWeapons", GearSwapLua.Ident("2H Weapons"));
    }

    [Fact]
    public void Ident_falls_back_when_empty()
    {
        Assert.Equal("Mode", GearSwapLua.Ident(""));
        Assert.Equal("Mode", GearSwapLua.Ident("!!!"));
    }
}
