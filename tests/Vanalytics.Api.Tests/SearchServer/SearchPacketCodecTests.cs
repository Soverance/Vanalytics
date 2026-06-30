using Vanalytics.Core.Services.SearchServer;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

public class SearchPacketCodecTests
{
    [Fact]
    public void EncodeHistoryRequest_SetsTypeItemAndStack_AndIsDecryptable()
    {
        var codec = new SearchPacketCodec();
        byte[] pkt = codec.EncodeHistoryRequest(itemId: 4096, stack: true, nonce: 0xAABBCCDD, out var ctx);

        Assert.True(pkt.Length >= SearchProtocol.MinPacket);
        Assert.Equal(pkt.Length, BitConverter.ToUInt16(pkt, 0x00));
        Assert.Equal(SearchProtocol.Magic, BitConverter.ToUInt32(pkt, 0x04));
        // type/item/stack are encrypted on the wire; decrypt with REQUEST keying to confirm round-trip
        var fields = SearchPacketCodec.DecryptRequestForTest(pkt, ctx);
        Assert.Equal(SearchProtocol.OpAhHistoryStack, fields.Type);
        Assert.Equal(4096, fields.ItemId);
        Assert.Equal(1, fields.Stack);
    }

    [Fact]
    public void DecodeHistoryResponse_ParsesSales()
    {
        var codec = new SearchPacketCodec();
        var ctx = new SearchKeyContext(Nonce: 0x11223344, ResponseSeed: 0);
        var sales = new List<AhSale>
        {
            new(Price: 1000, SoldAt: DateTimeOffset.FromUnixTimeSeconds(1_700_000_000), SellerName: "Seller", BuyerName: "Buyer", Stack: false),
            new(Price: 250000, SoldAt: DateTimeOffset.FromUnixTimeSeconds(1_700_100_000), SellerName: "Alpha", BuyerName: "Beta", Stack: false),
        };
        byte[] resp = SearchPacketCodec.BuildResponseForTest(itemId: 4096, category: 1, sales: sales, ctx: ctx);

        var parsed = codec.DecodeHistoryResponse(resp, ctx);

        Assert.Equal(2, parsed.Count);
        Assert.Equal(1000, parsed[0].Price);
        Assert.Equal("Seller", parsed[0].SellerName);
        Assert.Equal("Buyer", parsed[0].BuyerName);
        Assert.Equal(DateTimeOffset.FromUnixTimeSeconds(1_700_000_000), parsed[0].SoldAt);
        Assert.Equal(250000, parsed[1].Price);
    }
}
