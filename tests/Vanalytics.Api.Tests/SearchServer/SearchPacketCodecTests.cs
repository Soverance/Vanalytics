using Vanalytics.Core.Services.SearchServer;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

public class SearchPacketCodecTests
{
    // Golden vector captured from a REAL LandSandBoat xi_search server (item 4096 Fire Crystal,
    // single sale: price 12345, seller 'TestSeller', buyer 'TestBuyer', sell_date 1700000000).
    // Request used a fixed nonce 0x11223344 (responseSeed 0). This proves the codec is
    // wire-compatible with the real FFXI search protocol OFFLINE — it would have caught the
    // custom-Blowfish-F and signed-key-byte bugs that the self-mirrored round-trip tests missed.
    // To regenerate, see docs/superpowers/notes/lsb-search-validation.md + AhScraperLiveSearchTests.
    [Fact]
    public void DecodeHistoryResponse_DecodesRealXiSearchGoldenVector()
    {
        var ctx = new SearchKeyContext(Nonce: 0x11223344, ResponseSeed: 0);
        byte[] pkt = Convert.FromHexString(
            "640000004958464619B8B0E1A797D509A255FA326A70FC52E988432D96848DF7" +
            "960C5089C5D08C6CF75AF69CCECB37D46FD2C670EE844A2F077E47E8EDEF2F3E6" +
            "F9FBA248F91DDE13D62DE5E2B978830BEF230B609A616570B99467B30445A6644332211");

        var sales = new SearchPacketCodec().DecodeHistoryResponse(pkt, ctx).Sales;

        Assert.Single(sales);
        Assert.Equal(12345, sales[0].Price);
        Assert.Equal("TestSeller", sales[0].SellerName);
        Assert.Equal("TestBuyer", sales[0].BuyerName);
        Assert.Equal(DateTimeOffset.FromUnixTimeSeconds(1700000000), sales[0].SoldAt);
    }

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
    public void DecodeHistoryResponse_AcceptsStackResponse_AndFlagsSalesAsStack()
    {
        // A stack history request (opcode 0x06) yields a 0x86 response. The decoder must
        // accept it (not throw "unexpected type 0x86") and flag the sales as stack so the
        // ingestor records the correct StackSize.
        var codec = new SearchPacketCodec();
        var ctx = new SearchKeyContext(Nonce: 0x11223344, ResponseSeed: 0);
        var sales = new List<AhSale>
        {
            new(Price: 60000, SoldAt: DateTimeOffset.FromUnixTimeSeconds(1_700_000_000), SellerName: "S", BuyerName: "B", Stack: false),
        };
        byte[] resp = SearchPacketCodec.BuildResponseForTest(itemId: 4096, category: 1, sales: sales, ctx: ctx, stack: true);

        var parsed = codec.DecodeHistoryResponse(resp, ctx).Sales;

        Assert.Single(parsed);
        Assert.Equal(60000, parsed[0].Price);
        Assert.True(parsed[0].Stack);   // derived from the 0x86 response type
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

        var parsed = codec.DecodeHistoryResponse(resp, ctx).Sales;

        Assert.Equal(2, parsed.Count);
        Assert.Equal(1000, parsed[0].Price);
        Assert.Equal("Seller", parsed[0].SellerName);
        Assert.Equal("Buyer", parsed[0].BuyerName);
        Assert.Equal(DateTimeOffset.FromUnixTimeSeconds(1_700_000_000), parsed[0].SoldAt);
        Assert.Equal(250000, parsed[1].Price);
    }

    [Fact]
    public void DecodeHistoryResponse_ReadsCurrentOnAhQuantity()
    {
        var codec = new SearchPacketCodec();
        var ctx = new SearchKeyContext(Nonce: 0x11223344, ResponseSeed: 0);
        var sales = new List<AhSale>
        {
            new(Price: 1000, SoldAt: DateTimeOffset.FromUnixTimeSeconds(1_700_000_000), SellerName: "S", BuyerName: "B", Stack: false),
        };
        byte[] resp = SearchPacketCodec.BuildResponseForTest(itemId: 4096, category: 1, sales: sales, ctx: ctx, stack: false, quantity: 7);

        var result = codec.DecodeHistoryResponse(resp, ctx);

        Assert.Equal(7, result.OnAhQuantity);   // current count on AH (offset 0x1A)
        Assert.Single(result.Sales);
    }
}
