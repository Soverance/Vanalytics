using System.Buffers.Binary;
using System.Text;

namespace Vanalytics.Core.Services.SearchServer;

public class SearchPacketCodec
{
    // Retail AH-history request is a fixed 268-byte frame (reversed from a live capture).
    // Header bytes 0x08=0xB8, 0x0A=0x80, 0x14=0x04 are sent verbatim by the real client;
    // item id @0x12, stack flag @0x15, type @0x0B; the rest of the body is zero.
    private const int RequestLength = 0x10C;
    private const int ResponseSeedOffsetFromEnd = 0x18;

    public byte[] EncodeHistoryRequest(int itemId, bool stack, uint nonce, out SearchKeyContext ctx)
    {
        var buf = new byte[RequestLength];
        buf[0x08] = 0xB8;
        buf[0x0A] = 0x80;
        buf[SearchProtocol.OffType] = stack ? SearchProtocol.OpAhHistoryStack : SearchProtocol.OpAhHistorySingle; // 0x0B
        BinaryPrimitives.WriteUInt16LittleEndian(buf.AsSpan(SearchProtocol.OffItemId), (ushort)itemId);          // 0x12
        buf[0x14] = 0x04;
        buf[SearchProtocol.OffStack] = (byte)(stack ? 1 : 0);                                                    // 0x15

        // ResponseSeed = plaintext dword at length-0x18 (zero here; recorded for response keying)
        uint responseSeed = BinaryPrimitives.ReadUInt32LittleEndian(buf.AsSpan(RequestLength - ResponseSeedOffsetFromEnd));
        ctx = new SearchKeyContext(nonce, responseSeed);

        EncryptInPlace(buf, RequestKey(nonce), nonce);
        return buf;
    }

    public AhHistoryResult DecodeHistoryResponse(ReadOnlySpan<byte> packet, in SearchKeyContext ctx)
    {
        int length = packet.Length;
        if (length < SearchProtocol.MinPacket) throw new SearchProtocolException("packet too short");
        if (BinaryPrimitives.ReadUInt16LittleEndian(packet) != length) throw new SearchProtocolException("size mismatch");

        uint nonce = BinaryPrimitives.ReadUInt32LittleEndian(packet[(length - 4)..]);
        var buf = packet.ToArray();
        DecryptInPlace(buf, ResponseKey(nonce, ctx.ResponseSeed));

        if (!VerifyHash(buf)) throw new SearchProtocolException("hash mismatch");
        byte type = buf[SearchProtocol.OffType];
        if (type != SearchProtocol.RespAhHistory && type != SearchProtocol.RespAhHistoryStack)
            throw new SearchProtocolException($"unexpected type 0x{type:X2}");

        // The response type carries the single/stack distinction (0x85 single, 0x86 stack);
        // flag the sales so the ingestor records the correct StackSize.
        bool stack = type == SearchProtocol.RespAhHistoryStack;

        // Current count listed on the AH (singles for 0x85, stacks for 0x86) — u32 @ 0x1A.
        int onAhQuantity = length >= 0x1E ? (int)BinaryPrimitives.ReadUInt32LittleEndian(buf.AsSpan(0x1A)) : 0;

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
        return new AhHistoryResult(onAhQuantity, sales);
    }

    // Diagnostic only (not used in production): decrypts a raw response frame as-is, with no
    // type check or hash verify, so an unknown/unhandled layout (e.g. the stack 0x86 history
    // frame) can be captured and inspected. Assumes the frame is complete (nonce is the last 4 bytes).
    internal static byte[] DecryptResponseForCapture(byte[] packet, in SearchKeyContext ctx)
    {
        uint nonce = BinaryPrimitives.ReadUInt32LittleEndian(packet.AsSpan(packet.Length - 4));
        var buf = (byte[])packet.Clone();
        DecryptInPlace(buf, ResponseKey(nonce, ctx.ResponseSeed));
        return buf;
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


    internal static byte[] BuildResponseForTest(int itemId, int category, IReadOnlyList<AhSale> sales, in SearchKeyContext ctx, bool stack = false, int quantity = 0)
    {
        int count = Math.Min(sales.Count, 10);
        int length = 0x20 + 40 * count + 28;
        var buf = new byte[length];
        buf[0x0A] = 0x80;
        buf[SearchProtocol.OffType] = stack ? SearchProtocol.RespAhHistoryStack : SearchProtocol.RespAhHistory;
        BinaryPrimitives.WriteUInt16LittleEndian(buf.AsSpan(0x08), (ushort)(0x20 + 40 * count));
        BinaryPrimitives.WriteUInt16LittleEndian(buf.AsSpan(0x10), (ushort)itemId);
        BinaryPrimitives.WriteUInt16LittleEndian(buf.AsSpan(0x18), (ushort)itemId);
        BinaryPrimitives.WriteUInt32LittleEndian(buf.AsSpan(0x1A), (uint)quantity);   // current count on AH
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

    // ---- player search ----
    private const int SearchTagName = 0x00, SearchTagArea = 0x01, SearchTagNation = 0x02,
        SearchTagJob = 0x03, SearchTagLevel = 0x04, SearchTagRace = 0x05, SearchTagFlags1 = 0x06,
        SearchTagId = 0x08, SearchTagUnk0E = 0x0E, SearchTagRank = 0x10, SearchTagComment = 0x11,
        SearchTagFlags2 = 0x16, SearchTagLanguage = 0x17;
    private const int OffSearchSize = 0x10;
    // Retail /sea all request is a fixed 76-byte frame (reversed from a live capture):
    // header bytes 0x08=0x13, 0x0A=0x80; type @0x0B=0x00; criteria size @0x10=0x02 with
    // the 2-byte criteria payload 0x11=0x00, 0x12=0x10; rest zero.
    private const int SearchRequestLength = 0x4C;

    public byte[] EncodeSearchAllRequest(uint nonce, out SearchKeyContext ctx)
    {
        var buf = new byte[SearchRequestLength];
        buf[0x08] = 0x13;
        buf[0x0A] = 0x80;
        buf[SearchProtocol.OffType] = 0x00;   // TCP_SEARCH_ALL @0x0B
        buf[OffSearchSize] = 0x02;            // 2 criteria bytes @0x10
        buf[0x12] = 0x10;                     // criteria payload (0x11=0x00, 0x12=0x10)
        uint responseSeed = BinaryPrimitives.ReadUInt32LittleEndian(
            buf.AsSpan(SearchRequestLength - ResponseSeedOffsetFromEnd));
        ctx = new SearchKeyContext(nonce, responseSeed);
        EncryptInPlace(buf, RequestKey(nonce), nonce);
        return buf;
    }

    public IReadOnlyList<PlayerRecord> DecodePlayerListResponse(
        ReadOnlySpan<byte> packet, in SearchKeyContext ctx, out bool isFinal)
    {
        int length = packet.Length;
        if (length < SearchProtocol.MinPacket) throw new SearchProtocolException("packet too short");
        if (BinaryPrimitives.ReadUInt16LittleEndian(packet) != length) throw new SearchProtocolException("size mismatch");
        uint nonce = BinaryPrimitives.ReadUInt32LittleEndian(packet[(length - 4)..]);
        var buf = packet.ToArray();
        DecryptInPlace(buf, ResponseKey(nonce, ctx.ResponseSeed));
        if (!VerifyHash(buf)) throw new SearchProtocolException("hash mismatch");
        if (buf[SearchProtocol.OffType] != 0x80)
            throw new SearchProtocolException($"unexpected type 0x{buf[SearchProtocol.OffType]:X2}");

        isFinal = (buf[0x0A] & 0x80) != 0;
        int dataSize = BinaryPrimitives.ReadUInt16LittleEndian(buf.AsSpan(0x08));
        var players = new List<PlayerRecord>();
        int pos = 0x18;
        while (pos < dataSize)
        {
            int recSize = buf[pos];
            if (recSize == 0 || pos + 1 + recSize > dataSize) break;
            players.Add(ParseRecord(buf, (pos + 1) * 8, recSize * 8));
            pos += 1 + recSize;
        }
        return players;
    }

    private static PlayerRecord ParseRecord(ReadOnlySpan<byte> buf, int startBit, int recBits)
    {
        var r = new BitReader(buf, startBit);
        string name = ""; int zone = 0, nation = 0, mjob = 0, sjob = 0, mlvl = 0, slvl = 0, race = 0, rank = 0, id = 0;
        int end = startBit + recBits;
        while (r.BitPosition + 5 <= end)
        {
            int tag = (int)r.Read(5);
            // Guard: after reading tag, ensure enough bits remain for the minimum data of each field.
            // Padding zeros at the end of a byte-aligned record can spell tag=0 (SearchTagName);
            // a bounds check prevents reading past the record boundary into the next record's bytes.
            switch (tag)
            {
                case SearchTagName:
                    if (r.BitPosition + 4 > end) goto done;
                    int len = (int)r.Read(4);
                    if (r.BitPosition + len * 7 > end) goto done;
                    var chars = new char[len];
                    for (int i = 0; i < len; i++) chars[i] = (char)r.Read(7);
                    name = new string(chars);
                    break;
                case SearchTagArea:    if (r.BitPosition + 10 > end) goto done; zone   = (int)r.Read(10); break;
                case SearchTagNation:  if (r.BitPosition +  2 > end) goto done; nation = (int)r.Read(2);  break;
                case SearchTagJob:     if (r.BitPosition + 10 > end) goto done; mjob   = (int)r.Read(5); sjob = (int)r.Read(5); break;
                case SearchTagLevel:   if (r.BitPosition + 16 > end) goto done; mlvl   = (int)r.Read(8); slvl = (int)r.Read(8); break;
                case SearchTagRace:    if (r.BitPosition +  4 > end) goto done; race   = (int)r.Read(4);  break;
                case SearchTagRank:    if (r.BitPosition +  8 > end) goto done; rank   = (int)r.Read(8);  break;
                case SearchTagFlags1:  if (r.BitPosition + 16 > end) goto done; r.Read(16); break;
                case SearchTagId:      if (r.BitPosition + 20 > end) goto done; id     = (int)r.Read(20); break;
                case SearchTagUnk0E:   if (r.BitPosition + 32 > end) goto done; r.Read(32); break;
                case SearchTagComment: if (r.BitPosition + 32 > end) goto done; r.Read(32); break;
                case SearchTagFlags2:  if (r.BitPosition + 32 > end) goto done; r.Read(32); break;
                case SearchTagLanguage:if (r.BitPosition + 16 > end) goto done; r.Read(16); break;
                default: goto done;
            }
        }
        done:
        return new PlayerRecord(name, zone, nation, mjob, sjob, mlvl, slvl, race, rank, id);
    }

    // ---- player search test helpers ----
    internal readonly record struct SearchRequestFields(byte Type, byte Size);

    internal static SearchRequestFields DecryptSearchRequestForTest(byte[] packet, in SearchKeyContext ctx)
    {
        var buf = (byte[])packet.Clone();
        DecryptInPlace(buf, RequestKey(ctx.Nonce));
        return new SearchRequestFields(buf[SearchProtocol.OffType], buf[OffSearchSize]);
    }

    internal static SearchRequestFields DecryptSearchRequestForTestPublic(byte[] packet, out SearchKeyContext ctx)
    {
        uint nonce = BinaryPrimitives.ReadUInt32LittleEndian(packet.AsSpan(packet.Length - 4));
        var buf = (byte[])packet.Clone();
        DecryptInPlace(buf, RequestKey(nonce));
        uint seed = BinaryPrimitives.ReadUInt32LittleEndian(buf.AsSpan(packet.Length - ResponseSeedOffsetFromEnd));
        ctx = new SearchKeyContext(nonce, seed);
        return new SearchRequestFields(buf[SearchProtocol.OffType], buf[OffSearchSize]);
    }

    internal static byte[] BuildPlayerListForTest(IReadOnlyList<PlayerRecord> players, bool isFinal, in SearchKeyContext ctx)
    {
        // Pack records into a scratch buffer starting at byte 0x18, then size the frame.
        var body = new byte[2048];
        int bit = 0x18 * 8;
        foreach (var p in players)
        {
            int sizeOffByte = bit / 8; bit += 8; // reserve 1-byte size prefix
            bit = WriteBits(body, bit, SearchTagName, 5);
            int nlen = Math.Min(p.Name.Length, 15);
            bit = WriteBits(body, bit, (ulong)nlen, 4);
            for (int i = 0; i < nlen; i++) bit = WriteBits(body, bit, p.Name[i], 7);
            bit = WriteBits(body, bit, SearchTagArea, 5);    bit = WriteBits(body, bit, (ulong)p.Zone, 10);
            bit = WriteBits(body, bit, SearchTagNation, 5);  bit = WriteBits(body, bit, (ulong)p.Nation, 2);
            bit = WriteBits(body, bit, SearchTagJob, 5);     bit = WriteBits(body, bit, (ulong)p.MainJob, 5); bit = WriteBits(body, bit, (ulong)p.SubJob, 5);
            bit = WriteBits(body, bit, SearchTagLevel, 5);   bit = WriteBits(body, bit, (ulong)p.MainLevel, 8); bit = WriteBits(body, bit, (ulong)p.SubLevel, 8);
            bit = WriteBits(body, bit, SearchTagRace, 5);    bit = WriteBits(body, bit, (ulong)p.Race, 4);
            bit = WriteBits(body, bit, SearchTagRank, 5);    bit = WriteBits(body, bit, (ulong)p.Rank, 8);
            bit = WriteBits(body, bit, SearchTagFlags1, 5);  bit = WriteBits(body, bit, 0, 16);
            bit = WriteBits(body, bit, SearchTagId, 5);      bit = WriteBits(body, bit, (ulong)p.Id, 20);
            bit = WriteBits(body, bit, SearchTagFlags2, 5);  bit = WriteBits(body, bit, 0, 32);
            bit = WriteBits(body, bit, SearchTagLanguage, 5); bit = WriteBits(body, bit, 0, 16);
            // align to byte boundary
            if ((bit & 7) != 0) bit += 8 - (bit & 7);
            body[sizeOffByte] = (byte)(bit / 8 - sizeOffByte - 1);
        }
        int dataSize = bit / 8;
        int length = dataSize + 28; // 28-byte trailer (hash + nonce framing)
        var buf = new byte[length];
        Array.Copy(body, buf, dataSize);
        buf[0x0A] = (byte)(isFinal ? 0x80 : 0x00);
        buf[SearchProtocol.OffType] = 0x80;
        BinaryPrimitives.WriteUInt16LittleEndian(buf.AsSpan(0x08), (ushort)dataSize);
        BinaryPrimitives.WriteUInt16LittleEndian(buf.AsSpan(0x0E), (ushort)players.Count);
        EncryptInPlace(buf, ResponseKey(ctx.Nonce, ctx.ResponseSeed), ctx.Nonce);
        return buf;
    }

    // MSB-first, to mirror BitReader (retail player-list bit packing).
    private static int WriteBits(byte[] data, int bitOffset, ulong value, int count)
    {
        for (int i = 0; i < count; i++)
        {
            if (((value >> (count - 1 - i)) & 1) != 0)
                data[bitOffset >> 3] |= (byte)(1 << (7 - (bitOffset & 7)));
            bitOffset++;
        }
        return bitOffset;
    }
}

public sealed class SearchProtocolException(string message) : Exception(message);
