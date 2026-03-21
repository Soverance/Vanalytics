namespace Vanalytics.Core.Models;

public class SyncHistory
{
    public int Id { get; set; }
    public string ProviderId { get; set; } = string.Empty;
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string Status { get; set; } = string.Empty;
    public int ItemsAdded { get; set; }
    public int ItemsUpdated { get; set; }
    public int ItemsSkipped { get; set; }
    public int ItemsFailed { get; set; }
    public int TotalItems { get; set; }
    public string? ErrorMessage { get; set; }
}
