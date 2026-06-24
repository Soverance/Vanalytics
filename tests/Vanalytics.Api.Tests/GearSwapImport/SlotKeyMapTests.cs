using Vanalytics.Core.Services.GearSwapImport;

namespace Vanalytics.Api.Tests.GearSwapImport;

public class SlotKeyMapTests
{
    [Theory]
    [InlineData("main", "Main")]
    [InlineData("left_ear", "Ear1")]
    [InlineData("right_ear", "Ear2")]
    [InlineData("left_ring", "Ring1")]
    [InlineData("right_ring", "Ring2")]
    [InlineData("feet", "Feet")]
    public void Maps_known_lua_keys_to_internal_slot_names(string luaKey, string expected)
    {
        Assert.True(SlotKeyMap.TryToInternal(luaKey, out var slot));
        Assert.Equal(expected, slot);
    }

    [Theory]
    [InlineData("LEFT_EAR", "Ear1")]
    [InlineData("Head", "Head")]
    public void Is_case_insensitive(string luaKey, string expected)
    {
        Assert.True(SlotKeyMap.TryToInternal(luaKey, out var slot));
        Assert.Equal(expected, slot);
    }

    [Fact]
    public void Returns_false_for_unknown_keys()
    {
        Assert.False(SlotKeyMap.TryToInternal("pommel", out _));
    }
}
