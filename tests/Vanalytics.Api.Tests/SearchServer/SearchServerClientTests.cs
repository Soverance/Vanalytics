using System.Net;
using System.Net.Sockets;
using Vanalytics.Core.Services.SearchServer;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

public class SearchServerClientTests
{
    [Fact]
    public async Task GetSalesHistoryAsync_RoundTripsThroughTcp()
    {
        // Fake search server: decrypt request, reply with a canned history for the same ctx.
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
            var pkt = new byte[len];
            head.CopyTo(pkt, 0);
            await ns.ReadExactlyAsync(pkt.AsMemory(2, len - 2));

            var fields = SearchPacketCodec.DecryptRequestForTestPublic(pkt, out var ctx);
            var sales = new List<AhSale>
            {
                new(500, DateTimeOffset.FromUnixTimeSeconds(1_700_000_000), "Sel", "Buy", fields.Stack != 0),
            };
            var resp = SearchPacketCodec.BuildResponseForTest(fields.ItemId, 1, sales, ctx);
            await ns.WriteAsync(resp);
            await ns.FlushAsync();
        });

        await using var client = new SearchServerClient(new SearchPacketCodec());
        await client.ConnectAsync("127.0.0.1", port, CancellationToken.None);
        var result = await client.GetSalesHistoryAsync(4096, stack: false, CancellationToken.None);

        await serverTask;
        Assert.Single(result);
        Assert.Equal(500, result[0].Price);
        Assert.Equal("Sel", result[0].SellerName);
        }
        finally
        {
            listener.Stop();
        }
    }

    [Fact]
    public async Task GetOnlinePlayersAsync_ReadsMultiPacketRosterUntilFinal()
    {
        var listener = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, 0);
        listener.Start();
        int port = ((System.Net.IPEndPoint)listener.LocalEndpoint).Port;
        var serverTask = Task.Run(async () =>
        {
            try
            {
                using var conn = await listener.AcceptTcpClientAsync();
                using var ns = conn.GetStream();
                var head = new byte[2]; await ns.ReadExactlyAsync(head);
                int len = head[0] | (head[1] << 8);
                var pkt = new byte[len]; head.CopyTo(pkt, 0);
                await ns.ReadExactlyAsync(pkt.AsMemory(2, len - 2));
                var fields = SearchPacketCodec.DecryptSearchRequestForTestPublic(pkt, out var ctx);
                Assert.Equal(0x00, fields.Type);
                await ns.WriteAsync(SearchPacketCodec.BuildPlayerListForTest(
                    new List<PlayerRecord> { new("Alpha", 0, 0, 0, 0, 0, 0, 0, 0, 1) }, isFinal: false, ctx));
                await ns.WriteAsync(SearchPacketCodec.BuildPlayerListForTest(
                    new List<PlayerRecord> { new("Beta", 0, 0, 0, 0, 0, 0, 0, 0, 2) }, isFinal: true, ctx));
                await ns.FlushAsync();
            }
            finally { listener.Stop(); }
        });

        await using var client = new SearchServerClient(new SearchPacketCodec());
        await client.ConnectAsync("127.0.0.1", port, CancellationToken.None);
        var players = await client.GetOnlinePlayersAsync(CancellationToken.None);
        await serverTask;
        Assert.Equal(2, players.Count);
        Assert.Contains(players, p => p.Name == "Alpha");
        Assert.Contains(players, p => p.Name == "Beta");
    }
}
