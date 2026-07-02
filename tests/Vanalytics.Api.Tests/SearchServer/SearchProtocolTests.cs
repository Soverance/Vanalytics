using Vanalytics.Core.Services.SearchServer;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

public class SearchProtocolTests
{
    // FFXI uses a CUSTOMIZED Blowfish round function (see Blowfish.TT), so the standard
    // Schneier known-answer vector does NOT apply. Enciphering must at least transform the
    // input (not a no-op); true wire-compatibility is proven by AhScraperLiveSearchTests
    // against a real xi_search server.
    [Fact]
    public void Blowfish_Enciphers_TransformsInput()
    {
        var bf = new Blowfish(new byte[8]);
        uint xl = 0, xr = 0;
        bf.EncipherBlock(ref xl, ref xr);
        Assert.False(xl == 0 && xr == 0, "encipher should transform the all-zero block");
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
