using Vanalytics.Core.Services.SearchServer;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

public class AhSaleValidationTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 12, 0, 0, 0, TimeSpan.Zero);

    // FFXI names: English letters only, 3–15 characters, no digits/symbols/spaces.
    [Theory]
    [InlineData("Cloudspawn")]
    [InlineData("Janini")]
    [InlineData("Abc")]              // minimum length 3
    [InlineData("Abcdefghijklmno")]  // maximum length 15
    public void IsValidCharacterName_AcceptsRealNames(string name)
        => Assert.True(AhSaleValidation.IsValidCharacterName(name));

    [Theory]
    [InlineData("")]                  // empty
    [InlineData("ab")]                // too short (< 3)
    [InlineData("Abcdefghijklmnop")]  // too long (16)
    [InlineData("q?6q?K")]            // symbols
    [InlineData("Name42")]            // digits
    [InlineData("Two Words")]         // space
    [InlineData(null)]                // null
    public void IsValidCharacterName_RejectsInvalid(string? name)
        => Assert.False(AhSaleValidation.IsValidCharacterName(name));

    // Real AH prices are always positive; the garbage prices wrap negative as int32.
    [Fact]
    public void IsPlausible_RejectsNegativePrice()
        => Assert.False(AhSaleValidation.IsPlausible(-774252259, DateTimeOffset.FromUnixTimeSeconds(1_500_000_000), Now));

    [Fact]
    public void IsPlausible_AcceptsRealSale()
        => Assert.True(AhSaleValidation.IsPlausible(40000, DateTimeOffset.FromUnixTimeSeconds(1_589_900_000), Now));
}
