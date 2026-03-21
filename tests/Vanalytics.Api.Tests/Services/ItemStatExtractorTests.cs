using Vanalytics.Api.Services;
using Vanalytics.Core.Models;

namespace Vanalytics.Api.Tests.Services;

public class ItemStatExtractorTests
{
    [Fact]
    public void ExtractStats_ParsesDefense()
    {
        var item = new GameItem { ItemId = 1, Name = "Test" };
        ItemStatExtractor.ExtractStats(item, "DEF:50");
        Assert.Equal(50, item.DEF);
    }

    [Fact]
    public void ExtractStats_ParsesMainStats()
    {
        var item = new GameItem { ItemId = 1, Name = "Test" };
        ItemStatExtractor.ExtractStats(item, "DEF:50 HP+30 MP+20 STR+5 DEX+3 VIT+7 AGI+2 INT+4 MND+6 CHR+1");
        Assert.Equal(50, item.DEF);
        Assert.Equal(30, item.HP);
        Assert.Equal(20, item.MP);
        Assert.Equal(5, item.STR);
        Assert.Equal(3, item.DEX);
        Assert.Equal(7, item.VIT);
        Assert.Equal(2, item.AGI);
        Assert.Equal(4, item.INT);
        Assert.Equal(6, item.MND);
        Assert.Equal(1, item.CHR);
    }

    [Fact]
    public void ExtractStats_ParsesCombatStats()
    {
        var item = new GameItem { ItemId = 1, Name = "Test" };
        ItemStatExtractor.ExtractStats(item, "Accuracy+10 Attack+15 Evasion+5 Magic Accuracy+8 Magic Damage+12 Magic Evasion+20 Enmity-5 Haste+3%");
        Assert.Equal(10, item.Accuracy);
        Assert.Equal(15, item.Attack);
        Assert.Equal(5, item.Evasion);
        Assert.Equal(8, item.MagicAccuracy);
        Assert.Equal(12, item.MagicDamage);
        Assert.Equal(20, item.MagicEvasion);
        Assert.Equal(-5, item.Enmity);
        Assert.Equal(3, item.Haste);
    }

    [Fact]
    public void ExtractStats_ParsesTPStats()
    {
        var item = new GameItem { ItemId = 1, Name = "Test" };
        ItemStatExtractor.ExtractStats(item, "\"Store TP\"+10 \"TP Bonus\"+500");
        Assert.Equal(10, item.StoreTP);
        Assert.Equal(500, item.TPBonus);
    }

    [Fact]
    public void ExtractStats_ParsesDamageTaken()
    {
        var item = new GameItem { ItemId = 1, Name = "Test" };
        ItemStatExtractor.ExtractStats(item, "Physical Damage taken -3% Magic Damage taken -2%");
        Assert.Equal(-3, item.PhysicalDamageTaken);
        Assert.Equal(-2, item.MagicDamageTaken);
    }

    [Fact]
    public void ExtractStats_ParsesRangedStats()
    {
        var item = new GameItem { ItemId = 1, Name = "Test" };
        ItemStatExtractor.ExtractStats(item, "Ranged Accuracy+12 Ranged Attack+8");
        Assert.Equal(12, item.RangedAccuracy);
        Assert.Equal(8, item.RangedAttack);
    }

    [Fact]
    public void ExtractStats_HandlesNullDescription()
    {
        var item = new GameItem { ItemId = 1, Name = "Test" };
        ItemStatExtractor.ExtractStats(item, null);
        Assert.Null(item.DEF);
    }
}
