using Vanalytics.Api.Services.SearchServer;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

public class CidrRangeConfigTests
{
    [Theory]
    [InlineData("10.0.0.0/24", true)]
    [InlineData("192.168.1.0/30", true)]
    [InlineData("10.0.0.1/32", true)]
    [InlineData("10.0.0.0/1", true)]
    [InlineData("10.0.0.0/0", false)]    // /0 rejected (matches Enumerate)
    [InlineData("10.0.0.0/33", false)]   // prefix too large
    [InlineData("10.0.0.0", false)]      // no prefix
    [InlineData("10.0.0/24", false)]     // only 3 octets
    [InlineData("300.1.1.1/24", false)]  // octet out of range
    [InlineData("::1/64", false)]        // IPv6 rejected
    [InlineData("garbage", false)]
    [InlineData("", false)]
    public void IsValid_ChecksFormatAndPrefix(string cidr, bool expected)
        => Assert.Equal(expected, CidrRange.IsValid(cidr));

    [Fact]
    public void ParseCidrLines_TrimsDropsBlanksAndComments_PreservesOrder()
    {
        var text = "  10.0.0.0/24 \r\n# a comment\n\n192.168.1.0/30\n";
        var lines = CidrRange.ParseCidrLines(text);
        Assert.Equal(new[] { "10.0.0.0/24", "192.168.1.0/30" }, lines);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   \n  \n# only comments\n")]
    public void ParseCidrLines_Emptyish_ReturnsEmpty(string? text)
        => Assert.Empty(CidrRange.ParseCidrLines(text));
}
