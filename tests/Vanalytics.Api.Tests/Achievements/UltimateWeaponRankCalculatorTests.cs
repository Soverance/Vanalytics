using System.Collections.Generic;
using Vanalytics.Core.Data;
using Xunit;

namespace Vanalytics.Api.Tests.Achievements;

public class UltimateWeaponRankCalculatorTests
{
    // A base weapon at rank >= 75 that the character has held is returned once (the max stage).
    [Fact]
    public void Compute_KeepsHeldWeaponsAtOrAbove75_CollapsingToMaxRankPerName()
    {
        // Two stages of the same relic; only the higher-rank one should count, once.
        var catalog = new List<UwCatalogItem>
        {
            new(10001, "Excalibur", Level: 75, ItemLevel: 0, Description: "A relic weapon."),
            new(10002, "Excalibur", Level: 99, ItemLevel: 119, Description: "A relic weapon. Rank 15"),
            new(10003, "Ragnarok",  Level: 75, ItemLevel: 0, Description: "A relic weapon."),
        };
        var everHeld = new HashSet<int> { 10001, 10002 }; // holds two Excalibur stages, no Ragnarok

        var ranks = UltimateWeaponRankCalculator.Compute(catalog, everHeld);

        Assert.Single(ranks); // only Excalibur, collapsed to one entry
        Assert.True(ranks[0] >= 75);
    }

    [Fact]
    public void Compute_EmptyEverHeld_ReturnsEmpty()
    {
        var catalog = new List<UwCatalogItem>
        {
            new(10001, "Excalibur", 75, 0, "A relic weapon."),
        };
        Assert.Empty(UltimateWeaponRankCalculator.Compute(catalog, new HashSet<int>()));
    }

    [Fact]
    public void Compute_HeldItemNotInCatalog_IsIgnored()
    {
        var catalog = new List<UwCatalogItem>
        {
            new(10001, "Excalibur", 75, 0, "A relic weapon."),
        };
        var everHeld = new HashSet<int> { 99999 }; // held something, but not a UW item
        Assert.Empty(UltimateWeaponRankCalculator.Compute(catalog, everHeld));
    }

    // Discriminates the held-only filter: Ragnarok here is Lv.99 with no ItemLevel/description,
    // so UltimateWeaponStage.Rank hits the (int lv, null, _) => lv branch and yields 99, which is
    // >= 75 and would pass the rank threshold on its own. The only thing keeping it out of the
    // result is that the character never held it — if `.Where(i => everHeldItemIds.Contains(...))`
    // were removed from Compute, this would return [99] instead of empty.
    [Fact]
    public void Compute_UnheldItemAtOrAbove75_IsExcludedByHeldFilter()
    {
        var catalog = new List<UwCatalogItem>
        {
            new(20001, "Ragnarok", Level: 99, ItemLevel: null, Description: null),
        };
        var everHeld = new HashSet<int> { 30001 }; // holds something else; never held Ragnarok

        var ranks = UltimateWeaponRankCalculator.Compute(catalog, everHeld);

        Assert.Empty(ranks);
    }
}
