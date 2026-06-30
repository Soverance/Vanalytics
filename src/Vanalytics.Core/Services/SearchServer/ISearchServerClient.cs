namespace Vanalytics.Core.Services.SearchServer;

public interface ISearchServerClient : IAsyncDisposable
{
    Task ConnectAsync(string host, int port, CancellationToken ct);
    Task<IReadOnlyList<AhSale>> GetSalesHistoryAsync(int itemId, bool stack, CancellationToken ct);
}
