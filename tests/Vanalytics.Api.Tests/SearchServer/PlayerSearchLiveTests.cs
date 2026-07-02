using Vanalytics.Core.Services.SearchServer;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

/// <summary>
/// Opt-in end-to-end validation of GetOnlinePlayersAsync against a real
/// LandSandBoat search server.  The test is a plain [Fact] that returns
/// immediately (no-op pass) when the environment variables are absent, so it
/// never touches the network in CI or normal dev runs.
///
/// To activate, set:
///   LSB_SEARCH_HOST=127.0.0.1
///   LSB_SEARCH_PORT=54002
///   LSB_ONLINE_CHAR=&lt;charname that is currently logged in&gt;
/// See docs/superpowers/notes/lsb-search-validation.md for the full runbook.
/// </summary>
public class PlayerSearchLiveTests
{
    [Fact]
    public async Task DecodesOnlineRosterFromLandSandBoat()
    {
        var host = Environment.GetEnvironmentVariable("LSB_SEARCH_HOST");
        var portStr = Environment.GetEnvironmentVariable("LSB_SEARCH_PORT");
        var expect = Environment.GetEnvironmentVariable("LSB_ONLINE_CHAR"); // a char name seeded online
        if (string.IsNullOrEmpty(host) || !int.TryParse(portStr, out var port) || string.IsNullOrEmpty(expect))
            return; // skipped

        await using var client = new SearchServerClient(new SearchPacketCodec());
        await client.ConnectAsync(host, port, CancellationToken.None);
        var players = await client.GetOnlinePlayersAsync(CancellationToken.None);
        Assert.Contains(players, p => p.Name == expect);
    }
}
