using Vanalytics.Core.Services.SearchServer;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

public class SearchProtocolTests
{
    // Standard Blowfish ECB KAT: key=8 zero bytes, plaintext=0x0000000000000000 -> 0x4EF997456198DD78
    [Fact]
    public void Blowfish_StandardVector_Enciphers()
    {
        var bf = new Blowfish(new byte[8]);
        uint xl = 0, xr = 0;
        bf.EncipherBlock(ref xl, ref xr);
        Assert.Equal(0x4EF99745u, xl);
        Assert.Equal(0x6198DD78u, xr);
    }

    [Fact]
    public void Blowfish_Decipher_RoundTrips()
    {
        var bf = new Blowfish(new byte[] { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 });
        uint xl = 0xDEADBEEF, xr = 0x12345678;
        uint el = xl, er = xr;
        bf.EncipherBlock(ref el, ref er);
        bf.DecipherBlock(ref el, ref er);
        Assert.Equal(xl, el);
        Assert.Equal(xr, er);
    }
}
