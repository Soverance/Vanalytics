using Vanalytics.Api.Services;

namespace Vanalytics.Api.Tests.Services;

public class LuaResourceParserTests
{
    [Fact]
    public void ParseItems_ParsesGeneralItem()
    {
        var lua = """
            return {
                [1] = {id=1,en="Chocobo Bedding",ja="チョコボの寝ワラ",enl="pile of chocobo bedding",jal="チョコボの寝ワラ",category="General",flags=24660,stack=1,targets=0,type=10},
            }
            """;
        var items = LuaResourceParser.ParseItems(lua);
        Assert.Single(items);
        Assert.Equal(1, items[0].ItemId);
        Assert.Equal("Chocobo Bedding", items[0].Name);
        Assert.Equal("チョコボの寝ワラ", items[0].NameJa);
        Assert.Equal("pile of chocobo bedding", items[0].NameLong);
        Assert.Equal("General", items[0].Category);
        Assert.Equal(24660, items[0].Flags);
        Assert.Equal(1, items[0].StackSize);
        Assert.Equal(10, items[0].Type);
    }

    [Fact]
    public void ParseItems_ParsesWeapon()
    {
        var lua = """
            return {
                [16385] = {id=16385,en="Cesti",ja="セスタス",enl="cesti",jal="セスタス",category="Weapon",damage=4,delay=288,flags=2084,jobs=527334,level=1,races=510,skill=1,slots=1,stack=1,targets=0,type=4},
            }
            """;
        var items = LuaResourceParser.ParseItems(lua);
        Assert.Single(items);
        Assert.Equal("Weapon", items[0].Category);
        Assert.Equal(4, items[0].Damage);
        Assert.Equal(288, items[0].Delay);
        Assert.Equal(527334, items[0].Jobs);
        Assert.Equal(1, items[0].Level);
        Assert.Equal(510, items[0].Races);
        Assert.Equal(1, items[0].Skill);
        Assert.Equal(1, items[0].Slots);
    }

    [Fact]
    public void ParseItems_ParsesMultipleItems()
    {
        var lua = """
            return {
                [1] = {id=1,en="Item A",ja="A",enl="item a",jal="A",category="General",flags=0,stack=1,targets=0,type=10},
                [2] = {id=2,en="Item B",ja="B",enl="item b",jal="B",category="General",flags=0,stack=12,targets=0,type=10},
            }
            """;
        var items = LuaResourceParser.ParseItems(lua);
        Assert.Equal(2, items.Count);
    }

    [Fact]
    public void ParseDescriptions_ParsesDescriptions()
    {
        var lua = """
            return {
                [18976] = {id=18976,en="DMG:31 Delay:200",ja="Ｄ31 隔200"},
                [20515] = {id=20515,en="DMG:+197 Delay:+138\nMagic Damage+155",ja="Ｄ+197 隔+138"},
            }
            """;
        var descs = LuaResourceParser.ParseDescriptions(lua);
        Assert.Equal(2, descs.Count);
        Assert.Equal("DMG:31 Delay:200", descs[18976].En);
        Assert.Equal("Ｄ31 隔200", descs[18976].Ja);
        Assert.Equal("DMG:+197 Delay:+138\nMagic Damage+155", descs[20515].En);
    }
}
