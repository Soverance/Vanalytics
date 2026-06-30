namespace Vanalytics.Core.Services.SearchServer;

/// <summary>Reads LSB-first bit fields (matches LSB packBitsLE): bit 0 of a value is the
/// least-significant unread bit of the current byte.</summary>
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
            int bitIdx = _bit & 7;
            ulong bit = (ulong)((_data[byteIdx] >> bitIdx) & 1);
            result |= bit << i;
            _bit++;
        }
        return result;
    }

    internal void AlignToByte() { if ((_bit & 7) != 0) _bit += 8 - (_bit & 7); }
}
