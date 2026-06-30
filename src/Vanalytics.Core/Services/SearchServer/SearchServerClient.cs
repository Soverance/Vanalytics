using System.Net.Sockets;
using System.Security.Cryptography;

namespace Vanalytics.Core.Services.SearchServer;

/// <summary>
/// Represents a single reused TCP connection to the search server.
/// All calls are serialized through an internal semaphore — this client is
/// not designed for parallel fan-out per instance.
/// </summary>
public sealed class SearchServerClient(SearchPacketCodec codec) : ISearchServerClient
{
    private TcpClient? _tcp;
    private NetworkStream? _stream;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public async Task ConnectAsync(string host, int port, CancellationToken ct)
    {
        // Guard double-connect: dispose previous connection before creating a new one.
        if (_tcp is not null)
        {
            if (_stream is not null)
            {
                await _stream.DisposeAsync();
                _stream = null;
            }
            _tcp.Dispose();
            _tcp = null;
        }

        _tcp = new TcpClient();
        await _tcp.ConnectAsync(host, port, ct);
        _stream = _tcp.GetStream();
    }

    public async Task<IReadOnlyList<AhSale>> GetSalesHistoryAsync(int itemId, bool stack, CancellationToken ct)
    {
        if (_stream is null) throw new InvalidOperationException("not connected");

        await _gate.WaitAsync(ct);
        try
        {
            uint nonce = BitConverter.ToUInt32(RandomNumberGenerator.GetBytes(4));
            byte[] req = codec.EncodeHistoryRequest(itemId, stack, nonce, out var reqCtx);
            await _stream.WriteAsync(req, ct);
            await _stream.FlushAsync(ct);

            var head = new byte[2];
            await _stream.ReadExactlyAsync(head, ct);
            int len = head[0] | (head[1] << 8);
            if (len < SearchProtocol.MinPacket) throw new SearchProtocolException($"bad response length {len}");
            var pkt = new byte[len];
            head.CopyTo(pkt, 0);
            await _stream.ReadExactlyAsync(pkt.AsMemory(2, len - 2), ct);

            return codec.DecodeHistoryResponse(pkt, reqCtx);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<IReadOnlyList<PlayerRecord>> GetOnlinePlayersAsync(CancellationToken ct)
    {
        if (_stream is null) throw new InvalidOperationException("not connected");
        await _gate.WaitAsync(ct);
        try
        {
            uint nonce = BitConverter.ToUInt32(RandomNumberGenerator.GetBytes(4));
            byte[] req = codec.EncodeSearchAllRequest(nonce, out var ctx);
            await _stream.WriteAsync(req, ct);
            await _stream.FlushAsync(ct);

            var all = new List<PlayerRecord>();
            bool isFinal;
            do
            {
                var head = new byte[2];
                await _stream.ReadExactlyAsync(head, ct);
                int len = head[0] | (head[1] << 8);
                if (len < SearchProtocol.MinPacket) throw new SearchProtocolException($"bad response length {len}");
                var pkt = new byte[len]; head.CopyTo(pkt, 0);
                await _stream.ReadExactlyAsync(pkt.AsMemory(2, len - 2), ct);
                all.AddRange(codec.DecodePlayerListResponse(pkt, ctx, out isFinal));
            } while (!isFinal);
            return all;
        }
        finally { _gate.Release(); }
    }

    public async ValueTask DisposeAsync()
    {
        if (_stream is not null) await _stream.DisposeAsync();
        _tcp?.Dispose();
        _gate.Dispose();
    }
}
