using Vanalytics.Core.Services.GearSwapImport;

namespace Vanalytics.Api.Tests.GearSwapImport;

public class ItemNameResolverTests
{
    private static readonly (int, string)[] Catalog =
    [
        (18264, "Twashtar"),
        (27932, "Plunderer's Culottes +1"),
        (28503, "Herculean Boots"),
        (11000, "Adhemar Bonnet +1"),
    ];

    [Fact]
    public void Exact_match_wins()
    {
        var r = new ItemNameResolver(Catalog);
        var m = r.Resolve("Twashtar");
        Assert.Equal(18264, m.ItemId);
        Assert.Equal("exact", m.MatchKind);
    }

    [Fact]
    public void Normalized_match_ignores_case_and_punctuation_spacing()
    {
        var r = new ItemNameResolver(Catalog);
        var m = r.Resolve("plunderers culottes +1");
        Assert.Equal(27932, m.ItemId);
        Assert.Equal("normalized", m.MatchKind);
    }

    [Fact]
    public void Fuzzy_match_for_close_typo_with_confidence()
    {
        var r = new ItemNameResolver(Catalog);
        var m = r.Resolve("Herculean Boot");
        Assert.Equal(28503, m.ItemId);
        Assert.Equal("fuzzy", m.MatchKind);
        Assert.True(m.Confidence >= 0.85);
    }

    [Fact]
    public void Unresolved_when_nothing_close()
    {
        var r = new ItemNameResolver(Catalog);
        var m = r.Resolve("Completely Made Up Item");
        Assert.Equal(0, m.ItemId);
        Assert.Equal("unresolved", m.MatchKind);
    }
}
