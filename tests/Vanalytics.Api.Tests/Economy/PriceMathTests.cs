using Vanalytics.Core.Services.Economy;
using Xunit;

namespace Vanalytics.Api.Tests.Economy;

public class PriceMathTests
{
    [Fact]
    public void Median_OddCount_ReturnsMiddle()
        => Assert.Equal(20, PriceMath.Median(new[] { 30, 10, 20 }));

    [Fact]
    public void Median_EvenCount_AveragesTwoMiddle()
        => Assert.Equal(25, PriceMath.Median(new[] { 10, 20, 30, 40 })); // (20+30)/2

    [Fact]
    public void Median_EvenCount_FloorsOddSum()
        => Assert.Equal(15, PriceMath.Median(new[] { 10, 20 })); // (10+20)/2 = 15

    [Fact]
    public void Median_Empty_ReturnsZero()
        => Assert.Equal(0, PriceMath.Median(System.Array.Empty<int>()));

    [Fact]
    public void Median_LargeValues_NoOverflow()
        => Assert.Equal(2_000_000_000, PriceMath.Median(new[] { 2_000_000_000, 2_000_000_000 }));
}
