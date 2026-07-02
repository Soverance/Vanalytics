namespace Vanalytics.Core.Services.SearchServer;

/// <summary>Reads MSB-first bit fields, matching the FFXI retail search server's
/// player-list encoding: within each byte the most-significant unread bit comes first,
/// and multi-bit values accumulate most-significant-bit-first. (Verified against a live
/// retail capture — the first record decodes to a real character name.)</summary>
public ref struct BitReader
{
    private readonly ReadOnlySpan<byte> _data;
    private int _bit;

    public BitReader(ReadOnlySpan<byte> data, int startBit)
    {
        _data = data;
        _bit = startBit;
    }

    public int BitPosition => _bit;

    public ulong Read(int count)
    {
        ulong result = 0;
        for (int i = 0; i < count; i++)
        {
            int byteIdx = _bit >> 3;
            int bitIdx = 7 - (_bit & 7);
            ulong bit = (ulong)((_data[byteIdx] >> bitIdx) & 1);
            result = (result << 1) | bit;
            _bit++;
        }
        return result;
    }

    internal void AlignToByte() { if ((_bit & 7) != 0) _bit += 8 - (_bit & 7); }
}
