using System.Net.Sockets;
using System.Text;
using Vanalytics.Core.Services.SearchServer;
using Xunit;

namespace Vanalytics.Api.Tests.SearchServer;

/// <summary>
/// OPT-IN DIAGNOSTIC (not a real test). Captures the raw single (0x85) and stack (0x86)
/// AH-history response frames from a live search server so the stack layout — which the
/// codec currently can't read ("Unable to read beyond the end of the stream") — can be
/// decoded. No-ops (passes) unless AH_CAPTURE_HOST + AH_CAPTURE_PORT are set.
///
/// To run (points at the live search server, e.g. Siren):
///   AH_CAPTURE_HOST=124.150.154.71  AH_CAPTURE_PORT=54002 \
///   dotnet test Vanalytics/tests/Vanalytics.Api.Tests/Vanalytics.Api.Tests.csproj \
///     --filter "FullyQualifiedName~HistoryFrameCaptureTests"
///
/// The test intentionally FAILS, printing a hex dump of both frames (also written to
/// history-frame-capture.txt in the test working directory). Paste that output back.
/// </summary>
public class HistoryFrameCaptureTests
{
    private static (string host, int port)? Target()
    {
        var host = Environment.GetEnvironmentVariable("AH_CAPTURE_HOST");
        var portStr = Environment.GetEnvironmentVariable("AH_CAPTURE_PORT");
        if (string.IsNullOrEmpty(host) || !int.TryParse(portStr, out var port)) return null;
        return (host, port);
    }

    [Fact]
    public async Task CaptureSingleAndStackHistoryFrames()
    {
        var target = Target();
        if (target is null) return; // skipped: AH_CAPTURE_HOST / AH_CAPTURE_PORT not set

        var sb = new StringBuilder();
        sb.AppendLine($"=== AH history frame capture from {target.Value.host}:{target.Value.port} (item 4096 Fire Crystal) ===");

        // Item 4096 (Fire Crystal) is stackable, so both a single and a stack history exist.
        await CaptureAsync(target.Value.host, target.Value.port, itemId: 4096, stack: false, sb);
        await CaptureAsync(target.Value.host, target.Value.port, itemId: 4096, stack: true, sb);

        var report = sb.ToString();
        const string path = "history-frame-capture.txt";
        await File.WriteAllTextAsync(path, report);

        Assert.Fail(report + $"\n\n(also written to {Path.GetFullPath(path)})");
    }

    private static async Task CaptureAsync(string host, int port, int itemId, bool stack, StringBuilder sb)
    {
        var codec = new SearchPacketCodec();
        byte[] req = codec.EncodeHistoryRequest(itemId, stack, nonce: 0x11223344, out var ctx);

        sb.AppendLine();
        sb.AppendLine($"--- request stack={stack} (opcode 0x{(stack ? 0x06 : 0x05):X2}) ---");

        try
        {
            using var tcp = new TcpClient();
            await tcp.ConnectAsync(host, port);
            var stream = tcp.GetStream();
            await stream.WriteAsync(req);
            await stream.FlushAsync();

            // Read defensively: take everything the server sends (up to 8KB), stopping when the
            // declared frame is complete OR the stream goes idle for 4s. This avoids the
            // "read beyond end of stream" that ReadExactly hits on a wrong declared length.
            var buf = new byte[8192];
            int total = 0;
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(4));
            try
            {
                while (total < buf.Length)
                {
                    int r = await stream.ReadAsync(buf.AsMemory(total), cts.Token);
                    if (r == 0) break; // server closed
                    total += r;
                    if (total >= 2)
                    {
                        int declared = buf[0] | (buf[1] << 8);
                        if (declared >= 2 && total >= declared) break; // full declared frame received
                    }
                }
            }
            catch (OperationCanceledException) { /* idle timeout — use what arrived */ }

            var raw = buf.AsSpan(0, total).ToArray();
            int declaredLen = total >= 2 ? (raw[0] | (raw[1] << 8)) : -1;

            sb.AppendLine($"bytes received: {total}    declared length (bytes 0..1): {declaredLen}"
                          + (declaredLen > total ? "   <-- server sent FEWER bytes than declared" : ""));
            sb.AppendLine($"RAW: {Convert.ToHexString(raw)}");

            if (total >= 4)
            {
                try
                {
                    var dec = SearchPacketCodec.DecryptResponseForCapture(raw, ctx);
                    sb.AppendLine($"DECRYPTED: {Convert.ToHexString(dec)}");
                    sb.AppendLine($"  type @0x0B: 0x{dec[0x0B]:X2}   (0x85=single, 0x86=stack)");
                    if (dec.Length > 0x09) sb.AppendLine($"  size @0x08 (u16): {dec[0x08] | (dec[0x09] << 8)}");
                    if (dec.Length > 0x11) sb.AppendLine($"  itemId @0x10 (u16): {dec[0x10] | (dec[0x11] << 8)}");
                }
                catch (Exception ex) { sb.AppendLine($"decrypt failed: {ex.Message}"); }
            }
        }
        catch (Exception ex)
        {
            sb.AppendLine($"CONNECT/READ FAILED: {ex.GetType().Name}: {ex.Message}");
        }
    }
}
