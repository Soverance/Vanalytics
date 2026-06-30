using Vanalytics.Api.Services.SearchServer;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

public class WorldMapperTests
{
    [Fact]
    public void Map_PicksHighestOverlapAboveThreshold()
    {
        var online = new[] { "Alpha", "Beta", "Gamma", "Delta" };
        var byServer = new Dictionary<string, IReadOnlyCollection<string>>
        {
            ["Asura"] = new[] { "Alpha", "Beta", "Gamma" },
            ["Bahamut"] = new[] { "Zeta" },
        };
        var (server, confidence) = WorldMapper.Map(online, byServer, threshold: 2);
        Assert.Equal("Asura", server);
        Assert.Equal(3, confidence);
    }

    [Fact]
    public void Map_ReturnsNullWhenBelowThreshold()
    {
        var online = new[] { "Xx" };
        var byServer = new Dictionary<string, IReadOnlyCollection<string>>
        {
            ["Asura"] = new[] { "Alpha", "Beta" },
        };
        var (server, _) = WorldMapper.Map(online, byServer, threshold: 2);
        Assert.Null(server);
    }

    [Fact]
    public void Map_IsCaseInsensitive()
    {
        var online = new[] { "alpha", "BETA" };
        var byServer = new Dictionary<string, IReadOnlyCollection<string>> { ["Asura"] = new[] { "Alpha", "Beta" } };
        var (server, confidence) = WorldMapper.Map(online, byServer, threshold: 2);
        Assert.Equal("Asura", server);
        Assert.Equal(2, confidence);
    }
}

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
