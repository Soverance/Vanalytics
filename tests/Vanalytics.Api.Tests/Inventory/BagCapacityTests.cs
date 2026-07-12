using Vanalytics.Core.Inventory;
using Xunit;

namespace Vanalytics.Api.Tests.Inventory;

public class BagCapacityTests
{
    [Fact]
    public void CapOf_KnownPositiveCapacity_ReturnsStoredValue()
    {
        var caps = new Dictionary<string, int> { ["Inventory"] = 35 };
        Assert.Equal(35, BagCapacity.CapOf(caps, "Inventory"));
    }

    [Fact]
    public void CapOf_MissingBag_ReturnsDefault80()
    {
        var caps = new Dictionary<string, int>();
        Assert.Equal(80, BagCapacity.CapOf(caps, "Wardrobe"));
        Assert.Equal(80, BagCapacity.DefaultMaxSlots);
    }

    [Fact]
    public void CapOf_ZeroOrNegative_FallsBackToDefault()
    {
        var caps = new Dictionary<string, int> { ["Safe"] = 0, ["Sack"] = -1 };
        Assert.Equal(80, BagCapacity.CapOf(caps, "Safe"));
        Assert.Equal(80, BagCapacity.CapOf(caps, "Sack"));
    }
}
