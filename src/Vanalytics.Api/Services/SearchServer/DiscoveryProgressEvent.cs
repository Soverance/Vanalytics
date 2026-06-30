namespace Vanalytics.Api.Services.SearchServer;

public record DiscoveryProgressEvent
{
    public required string Type { get; init; }   // Started|Progress|Completed|Cancelled|Failed
    public string? Message { get; init; }
    public int Scanned { get; init; }
    public int Total { get; init; }
    public int Found { get; init; }
    public int Mapped { get; init; }
    public int Unmapped { get; init; }
}

public record DiscoveryResult(int Found, int Mapped, int Unmapped);

/// <summary>
/// Abstraction over <see cref="Vanalytics.Core.Services.SearchServer.SearchEndpointProber"/>
/// so tests can inject a fake without touching the network.
/// </summary>
public interface IDiscoveryProber
{
    Task<bool> IsSearchServerAsync(string host, int port, int probeItemId, int timeoutMs, CancellationToken ct);
}

/// <summary>
/// Factory that produces a fresh <see cref="Vanalytics.Core.Services.SearchServer.ISearchServerClient"/>
/// per discovered endpoint. Tests inject fakes; production wraps <see cref="Vanalytics.Core.Services.SearchServer.SearchServerClient"/>.
/// </summary>
public interface ISearchServerClientFactory
{
    Vanalytics.Core.Services.SearchServer.ISearchServerClient Create();
}
