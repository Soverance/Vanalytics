using System.Net;
using System.Net.Sockets;
using Vanalytics.Core.Services.SearchServer;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

public class SearchEndpointProberTests
{
    [Fact]
    public async Task IsSearchServerAsync_TrueWhenServerRepliesWith0x85()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        int port = ((IPEndPoint)listener.LocalEndpoint).Port;
        try
        {
            var serverTask = Task.Run(async () =>
            {
                using var conn = await listener.AcceptTcpClientAsync();
                using var ns = conn.GetStream();
                var head = new byte[2];
                await ns.ReadExactlyAsync(head);
                int len = head[0] | (head[1] << 8);
                var pkt = new byte[len]; head.CopyTo(pkt, 0);
                await ns.ReadExactlyAsync(pkt.AsMemory(2, len - 2));
                var fields = SearchPacketCodec.DecryptRequestForTestPublic(pkt, out var ctx);
                var sales = new List<AhSale> { new(1, DateTimeOffset.FromUnixTimeSeconds(1), "S", "B", false) };
                await ns.WriteAsync(SearchPacketCodec.BuildResponseForTest(fields.ItemId, 1, sales, ctx));
            });

            var prober = new SearchEndpointProber(new SearchPacketCodec());
            bool ok = await prober.IsSearchServerAsync("127.0.0.1", port, probeItemId: 4096, timeoutMs: 3000, CancellationToken.None);
            await serverTask;
            Assert.True(ok);
        }
        finally
        {
            listener.Stop();
        }
    }

    [Fact]
    public async Task IsSearchServerAsync_FalseWhenNothingListening()
    {
        var prober = new SearchEndpointProber(new SearchPacketCodec());
        bool ok = await prober.IsSearchServerAsync("127.0.0.1", 1, probeItemId: 4096, timeoutMs: 500, CancellationToken.None);
        Assert.False(ok);
    }
}
