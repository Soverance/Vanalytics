namespace Vanalytics.Core.Services.SearchServer;

public interface ISearchServerClient : IAsyncDisposable
{
    Task ConnectAsync(string host, int port, CancellationToken ct);
    Task<AhHistoryResult> GetSalesHistoryAsync(int itemId, bool stack, CancellationToken ct);
    Task<IReadOnlyList<PlayerRecord>> GetOnlinePlayersAsync(CancellationToken ct);
}
