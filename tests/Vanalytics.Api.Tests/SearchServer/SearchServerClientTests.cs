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
}
