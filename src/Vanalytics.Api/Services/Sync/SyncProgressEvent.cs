namespace Vanalytics.Api.Services.Sync;

public enum SyncEventType { Started, Progress, Completed, Failed, Cancelled }

public record SyncProgressEvent
{
    public required string ProviderId { get; init; }
    public required SyncEventType Type { get; init; }
    public string? Message { get; init; }
    public string? CurrentItem { get; init; }
    public int? CurrentItemId { get; init; }
    public int Current { get; init; }
    public int Total { get; init; }
    public int Added { get; init; }
    public int Updated { get; init; }
    public int Skipped { get; init; }
    public int Failed { get; init; }
}
