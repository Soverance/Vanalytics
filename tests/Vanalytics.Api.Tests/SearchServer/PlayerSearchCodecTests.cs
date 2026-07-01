using Vanalytics.Core.Services.SearchServer;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

public class PlayerSearchCodecTests
{
    [Fact]
    public void BitReader_ReadsMsbFirst()
    {
        // 0xB4 = 1011_0100. MSB-first: read 3 => 101 = 5, read 3 => 101 = 5, read 2 => 00 = 0.
        var r = new BitReader(new byte[] { 0xB4 }, 0);
        Assert.Equal(5ul, r.Read(3));
        Assert.Equal(5ul, r.Read(3));
        Assert.Equal(0ul, r.Read(2));
        // 0x80 = 1000_0000: first bit MSB-first is 1 (would be 0 if LSB-first).
        var r2 = new BitReader(new byte[] { 0x80 }, 0);
        Assert.Equal(1ul, r2.Read(1));
    }

    [Fact]
    public void EncodeSearchAllRequest_SetsRetailOpcodeAndCriteriaSize()
    {
        var codec = new SearchPacketCodec();
        byte[] pkt = codec.EncodeSearchAllRequest(0xAABBCCDD, out var ctx);
        Assert.Equal(0x4C, pkt.Length);    // retail /sea all frame is 76 bytes
        var fields = SearchPacketCodec.DecryptSearchRequestForTest(pkt, ctx);
        Assert.Equal(0x00, fields.Type);   // TCP_SEARCH_ALL
        Assert.Equal(2, fields.Size);      // retail sends a 2-byte criteria block
    }

    [Fact]
    public void DecodePlayerListResponse_RoundTripsRecordsAndFinalFlag()
    {
        var codec = new SearchPacketCodec();
        var ctx = new SearchKeyContext(Nonce: 0x11223344, ResponseSeed: 0);
        var players = new List<PlayerRecord>
        {
            new("Tarutaru", Zone: 230, Nation: 1, MainJob: 5, SubJob: 3, MainLevel: 99, SubLevel: 49, Race: 4, Rank: 10, Id: 12345),
            new("Bob", Zone: 50, Nation: 0, MainJob: 1, SubJob: 0, MainLevel: 75, SubLevel: 37, Race: 1, Rank: 5, Id: 999),
        };
        byte[] resp = SearchPacketCodec.BuildPlayerListForTest(players, isFinal: true, ctx);

        var parsed = codec.DecodePlayerListResponse(resp, ctx, out bool isFinal);

        Assert.True(isFinal);
        Assert.Equal(2, parsed.Count);
        Assert.Equal("Tarutaru", parsed[0].Name);
        Assert.Equal(99, parsed[0].MainLevel);
        Assert.Equal("Bob", parsed[1].Name);
    }

    [Fact]
    public void DecodePlayerListResponse_NonFinalFlag()
    {
        var codec = new SearchPacketCodec();
        var ctx = new SearchKeyContext(Nonce: 0xDEADBEEF, ResponseSeed: 0);
        var players = new List<PlayerRecord>
        {
            new("Elvaan", Zone: 100, Nation: 2, MainJob: 2, SubJob: 1, MainLevel: 50, SubLevel: 25, Race: 2, Rank: 3, Id: 42),
        };
        byte[] resp = SearchPacketCodec.BuildPlayerListForTest(players, isFinal: false, ctx);

        codec.DecodePlayerListResponse(resp, ctx, out bool isFinal);

        Assert.False(isFinal);
    }

    [Fact]
    public void DecodePlayerListResponse_EmptyRoster()
    {
        var codec = new SearchPacketCodec();
        var ctx = new SearchKeyContext(Nonce: 0xCAFEBABE, ResponseSeed: 0);
        byte[] resp = SearchPacketCodec.BuildPlayerListForTest(
            new List<PlayerRecord>(), isFinal: true, ctx);

        var parsed = codec.DecodePlayerListResponse(resp, ctx, out bool isFinal);

        Assert.Empty(parsed);
        Assert.True(isFinal);
    }
}
