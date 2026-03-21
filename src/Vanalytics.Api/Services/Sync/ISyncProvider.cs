namespace Vanalytics.Api.Services.Sync;

public interface ISyncProvider
{
    string ProviderId { get; }
    string DisplayName { get; }
    Task SyncAsync(IProgress<SyncProgressEvent> progress, CancellationToken ct);
}
