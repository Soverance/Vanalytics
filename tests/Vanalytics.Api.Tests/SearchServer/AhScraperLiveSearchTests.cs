using Vanalytics.Core.Services.SearchServer;

namespace Vanalytics.Api.Tests.SearchServer;

/// <summary>
/// Opt-in end-to-end validation against a local LandSandBoat search server.
/// The test is a plain [Fact] that returns immediately (no-op pass) when the
/// environment variables are absent, so it never touches the network in CI or
/// normal dev runs.
///
/// To activate, set:
///   LSB_SEARCH_HOST=127.0.0.1
///   LSB_SEARCH_PORT=54002
/// and ensure a known row is seeded in the LSB auction_house table.
/// See docs/superpowers/notes/lsb-search-validation.md for the full runbook.
/// </summary>
public class AhScraperLiveSearchTests
{
    /// <summary>
    /// Returns the (host, port) target when both env vars are set, otherwise null.
    /// No network activity occurs when this returns null.
    /// </summary>
    private static (string host, int port)? Target()
    {
        var host = Environment.GetEnvironmentVariable("LSB_SEARCH_HOST");
        var portStr = Environment.GetEnvironmentVariable("LSB_SEARCH_PORT");
        if (string.IsNullOrEmpty(host) || !int.TryParse(portStr, out var port))
            return null;
        return (host, port);
    }

    [Fact]
    public async Task DecodesRealHistoryFromLandSandBoat()
    {
        var target = Target();
        if (target is null)
            return; // skipped: LSB_SEARCH_HOST / LSB_SEARCH_PORT not set

        await using var client = new SearchServerClient(new SearchPacketCodec());
        await client.ConnectAsync(target.Value.host, target.Value.port, CancellationToken.None);
        var sales = (await client.GetSalesHistoryAsync(4096, stack: false, CancellationToken.None)).Sales;

        Assert.NotEmpty(sales);
        Assert.Contains(sales, s =>
            s.SellerName == "TestSeller" &&
            s.BuyerName  == "TestBuyer"  &&
            s.Price      == 12345);
    }
}
