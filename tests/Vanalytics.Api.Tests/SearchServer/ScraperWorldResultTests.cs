using Vanalytics.Api.Services;
using Vanalytics.Core.Models;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

public class ScraperWorldResultTests
{
    private static GameServer World() => new() { Name = "Siren" };

    [Fact]
    public void ApplyWorldScrapeResult_OnFailure_StampsErrorAndTimestamp()
    {
        var world = World();
        var now = DateTimeOffset.FromUnixTimeSeconds(1_700_000_000);

        AuctionHouseScraper.ApplyWorldScrapeResult(world, "connect timed out", now);

        Assert.Equal("connect timed out", world.LastScrapeError);
        Assert.Equal(now, world.LastScrapeErrorAt);
    }

    [Fact]
    public void ApplyWorldScrapeResult_OnSuccess_ClearsPreviousError()
    {
        var world = World();
        world.LastScrapeError = "old failure";
        world.LastScrapeErrorAt = DateTimeOffset.FromUnixTimeSeconds(1_699_000_000);

        AuctionHouseScraper.ApplyWorldScrapeResult(world, error: null, DateTimeOffset.FromUnixTimeSeconds(1_700_000_000));

        Assert.Null(world.LastScrapeError);
        Assert.Null(world.LastScrapeErrorAt);
    }
}
