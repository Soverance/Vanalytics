namespace Vanalytics.Core.Services.SearchServer;

/// <summary>
/// Confirms whether a candidate host:port speaks the FFXI search protocol
/// by sending a single history request and verifying the response decodes cleanly.
/// Used as the reusable core of discovery / range scanning.
/// </summary>
public class SearchEndpointProber(SearchPacketCodec codec)
{
    /// <summary>
    /// Returns <c>true</c> if the endpoint responds with a well-formed 0x85 history packet;
    /// <c>false</c> on any exception (connection refused, timeout, malformed response, hash failure).
    /// </summary>
    public async Task<bool> IsSearchServerAsync(
        string host, int port, int probeItemId, int timeoutMs, CancellationToken ct)
    {
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(timeoutMs);
            await using var client = new SearchServerClient(codec);
            await client.ConnectAsync(host, port, cts.Token);
            await client.GetSalesHistoryAsync(probeItemId, stack: false, cts.Token);
            return true; // clean decode → it's a search server
        }
        catch
        {
            return false;
        }
    }
}
