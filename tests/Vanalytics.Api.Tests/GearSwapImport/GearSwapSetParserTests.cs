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
}
