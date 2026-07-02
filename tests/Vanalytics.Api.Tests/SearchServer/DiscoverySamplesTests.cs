using Vanalytics.Api.Services.SearchServer;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

public class DiscoverySamplesTests
{
    [Fact]
    public void RoundTrips_CamelCase()
    {
        var samples = new List<ProbeItemSample>
        {
            new(4096, new List<SampleSale>
            {
                new(100, DateTimeOffset.FromUnixTimeSeconds(1_700_000_000), "Seller", "Buyer"),
            }),
        };

        var json = DiscoverySamples.Serialize(samples);
        Assert.Contains("\"itemId\":4096", json);
        Assert.Contains("\"sellerName\":\"Seller\"", json);

        var back = DiscoverySamples.Deserialize(json);
        Assert.Single(back);
        Assert.Equal(4096, back[0].ItemId);
        Assert.Equal(100, back[0].Sales[0].Price);
    }

    [Fact]
    public void Deserialize_Empty_ReturnsEmptyList()
    {
        Assert.Empty(DiscoverySamples.Deserialize("[]"));
    }
}
