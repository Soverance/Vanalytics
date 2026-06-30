using System.Buffers.Binary;
using System.Text;

namespace Vanalytics.Core.Services.SearchServer;

public class SearchPacketCodec
{
    private const int RequestLength = 0x30;          // chosen fixed request frame (0x30 keeps body fields below hash region at 0x1C)
    private const int ResponseSeedOffsetFromEnd = 0x18;

    public byte[] EncodeHistoryRequest(int itemId, bool stack, uint nonce, out SearchKeyContext ctx)
    {
        var buf = new byte[RequestLength];
        buf[SearchProtocol.OffType] = stack ? SearchProtocol.OpAhHistoryStack : SearchProtocol.OpAhHistorySingle;
        BinaryPrimitives.WriteUInt16LittleEndian(buf.AsSpan(SearchProtocol.OffItemId), (ushort)itemId);
        buf[SearchProtocol.OffStack] = (byte)(stack ? 1 : 0);

        // ResponseSeed = plaintext dword at length-0x18 (left as 0 here, recorded for response keying)
        uint responseSeed = BinaryPrimitives.ReadUInt32LittleEndian(buf.AsSpan(RequestLength - ResponseSeedOffsetFromEnd));
        ctx = new SearchKeyContext(nonce, responseSeed);

        EncryptInPlace(buf, RequestKey(nonce), nonce);
        return buf;
    }

    public IReadOnlyList<AhSale> DecodeHistoryResponse(ReadOnlySpan<byte> packet, in SearchKeyContext ctx)
    {
        int length = packet.Length;
        if (length < SearchProtocol.MinPacket) throw new SearchProtocolException("packet too short");
        if (BinaryPrimitives.ReadUInt16LittleEndian(packet) != length) throw new SearchProtocolException("size mismatch");

        uint nonce = BinaryPrimitives.ReadUInt32LittleEndian(packet[(length - 4)..]);
        var buf = packet.ToArray();
        DecryptInPlace(buf, ResponseKey(nonce, ctx.ResponseSeed));

        if (!VerifyHash(buf)) throw new SearchProtocolException("hash mismatch");
        if (buf[SearchProtocol.OffType] != SearchProtocol.RespAhHistory)
            throw new SearchProtocolException($"unexpected type 0x{buf[SearchProtocol.OffType]:X2}");

        bool stack = false; // history packet does not echo stack; caller knows from the request
        var sales = new List<AhSale>();
        const int firstEntry = 0x20, stride = 40, maxEntries = 10;
        for (int n = 0; n < maxEntries; n++)
        {
            int b = firstEntry + stride * n;
            if (b + stride > length - 0x1C) break; // not within payload
            int price = (int)BinaryPrimitives.ReadUInt32LittleEndian(buf.AsSpan(b + 0x00));
            uint ts    = BinaryPrimitives.ReadUInt32LittleEndian(buf.AsSpan(b + 0x04));
            string seller = ReadName(buf, b + 0x08);
            string buyer  = ReadName(buf, b + 0x18);
            if (price == 0 && ts == 0 && seller.Length == 0 && buyer.Length == 0) continue;
            sales.Add(new AhSale(price, DateTimeOffset.FromUnixTimeSeconds(ts), seller, buyer, stack));
        }
        return sales;
    }

    private static string ReadName(byte[] buf, int offset)
    {
        var span = buf.AsSpan(offset, 15);
        int len = span.IndexOf((byte)0);
        if (len < 0) len = 15;
        return Encoding.ASCII.GetString(span[..len]);
    }

    private static Blowfish RequestKey(uint nonce)
    {
        Span<byte> k = stackalloc byte[20];
        SearchProtocol.KeySeed[..16].CopyTo(k);
        BinaryPrimitives.WriteUInt32LittleEndian(k[16..], nonce);
        return new Blowfish(SearchProtocol.Md5(k));
    }

    private static Blowfish ResponseKey(uint nonce, uint responseSeed)
    {
        Span<byte> k = stackalloc byte[24];
        SearchProtocol.KeySeed[..16].CopyTo(k);
        BinaryPrimitives.WriteUInt32LittleEndian(k[16..], nonce);
        BinaryPrimitives.WriteUInt32LittleEndian(k[20..], responseSeed);
        return new Blowfish(SearchProtocol.Md5(k));
    }

    private static void EncryptInPlace(byte[] buf, Blowfish bf, uint nonce)
    {
        int length = buf.Length;
        BinaryPrimitives.WriteUInt16LittleEndian(buf, (ushort)length);
        BinaryPrimitives.WriteUInt32LittleEndian(buf.AsSpan(0x04), SearchProtocol.Magic);
        WriteHash(buf);
        CipherPairs(buf, bf, encipher: true);
        BinaryPrimitives.WriteUInt32LittleEndian(buf.AsSpan(length - 4), nonce);
    }

    private static void DecryptInPlace(byte[] buf, Blowfish bf) => CipherPairs(buf, bf, encipher: false);

    private static void CipherPairs(byte[] buf, Blowfish bf, bool encipher)
    {
        int length = buf.Length;
        int dwords = (length - 12) / 4;
        dwords -= dwords % 2;
        for (int i = 0; i < dwords; i += 2)
        {
            int o1 = (i + 2) * 4, o2 = (i + 3) * 4;
            uint xl = BinaryPrimitives.ReadUInt32LittleEndian(buf.AsSpan(o1));
            uint xr = BinaryPrimitives.ReadUInt32LittleEndian(buf.AsSpan(o2));
            if (encipher) bf.EncipherBlock(ref xl, ref xr); else bf.DecipherBlock(ref xl, ref xr);
            BinaryPrimitives.WriteUInt32LittleEndian(buf.AsSpan(o1), xl);
            BinaryPrimitives.WriteUInt32LittleEndian(buf.AsSpan(o2), xr);
        }
    }

    private static void WriteHash(byte[] buf)
    {
        int length = buf.Length;
        var hash = SearchProtocol.Md5(buf.AsSpan(0x08, length - 0x1C));
        hash.CopyTo(buf.AsSpan(length - 0x14));
    }

    private static bool VerifyHash(byte[] buf)
    {
        int length = buf.Length;
        var hash = SearchProtocol.Md5(buf.AsSpan(0x08, length - 0x1C));
        return buf.AsSpan(length - 0x14, 16).SequenceEqual(hash);
    }

    // ---- test-only helpers (mirror the server) ----
    internal readonly record struct RequestFields(byte Type, int ItemId, byte Stack);

    internal static RequestFields DecryptRequestForTest(byte[] packet, in SearchKeyContext ctx)
    {
        var buf = (byte[])packet.Clone();
        DecryptInPlace(buf, RequestKey(ctx.Nonce));
        return new RequestFields(
            buf[SearchProtocol.OffType],
            BinaryPrimitives.ReadUInt16LittleEndian(buf.AsSpan(SearchProtocol.OffItemId)),
            buf[SearchProtocol.OffStack]);
    }

    internal static RequestFields DecryptRequestForTestPublic(byte[] packet, out SearchKeyContext ctx)
    {
        uint nonce = BinaryPrimitives.ReadUInt32LittleEndian(packet.AsSpan(packet.Length - 4));
        var buf = (byte[])packet.Clone();
        DecryptInPlace(buf, RequestKey(nonce));
        uint seed = BinaryPrimitives.ReadUInt32LittleEndian(buf.AsSpan(packet.Length - ResponseSeedOffsetFromEnd));
        ctx = new SearchKeyContext(nonce, seed);
        return new RequestFields(buf[SearchProtocol.OffType],
            BinaryPrimitives.ReadUInt16LittleEndian(buf.AsSpan(SearchProtocol.OffItemId)),
            buf[SearchProtocol.OffStack]);
    }

    internal static byte[] BuildResponseForTest(int itemId, int category, IReadOnlyList<AhSale> sales, in SearchKeyContext ctx)
    {
        int count = Math.Min(sales.Count, 10);
        int length = 0x20 + 40 * count + 28;
        var buf = new byte[length];
        buf[0x0A] = 0x80;
        buf[SearchProtocol.OffType] = SearchProtocol.RespAhHistory;
        BinaryPrimitives.WriteUInt16LittleEndian(buf.AsSpan(0x08), (ushort)(0x20 + 40 * count));
        BinaryPrimitives.WriteUInt16LittleEndian(buf.AsSpan(0x10), (ushort)itemId);
        BinaryPrimitives.WriteUInt16LittleEndian(buf.AsSpan(0x18), (ushort)itemId);
        BinaryPrimitives.WriteUInt16LittleEndian(buf.AsSpan(0x1E), (ushort)category);
        for (int n = 0; n < count; n++)
        {
            int b = 0x20 + 40 * n;
            BinaryPrimitives.WriteUInt32LittleEndian(buf.AsSpan(b + 0x00), (uint)sales[n].Price);
            BinaryPrimitives.WriteUInt32LittleEndian(buf.AsSpan(b + 0x04), (uint)sales[n].SoldAt.ToUnixTimeSeconds());
            WriteName(buf, b + 0x08, sales[n].SellerName);
            WriteName(buf, b + 0x18, sales[n].BuyerName);
        }
        EncryptInPlace(buf, ResponseKey(ctx.Nonce, ctx.ResponseSeed), ctx.Nonce);
        return buf;
    }

    private static void WriteName(byte[] buf, int offset, string name)
    {
        var bytes = Encoding.ASCII.GetBytes(name);
        int n = Math.Min(bytes.Length, 15);
        Array.Copy(bytes, 0, buf, offset, n);
    }
}

public sealed class SearchProtocolException(string message) : Exception(message);
