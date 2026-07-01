using Vanalytics.Api.Services.SearchServer;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

// Relocated from WorldMapperTests.cs (deleted when the roster-based mapper was retired).
// CidrRange is still production code — it enumerates the scan IPs for discovery.
public class CidrRangeTests
{
    [Fact]
    public void Enumerate_Slash30_YieldsFourAddresses()
    {
        var ips = CidrRange.Enumerate("192.168.1.0/30").ToList();
        Assert.Equal(new[] { "192.168.1.0", "192.168.1.1", "192.168.1.2", "192.168.1.3" }, ips);
    }

    [Fact]
    public void Enumerate_RejectsZeroPrefix()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => CidrRange.Enumerate("0.0.0.0/0").ToList());
    }
}
