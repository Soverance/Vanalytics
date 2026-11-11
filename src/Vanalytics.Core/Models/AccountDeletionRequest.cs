namespace Vanalytics.Core.Models;

/// <summary>
/// A pending account deletion. One row per user; the row's existence is what "pending deletion"
/// means. Self-service requests are scheduled 7 days out (grace period, cancellable by signing in);
/// admin deletions are scheduled for "now" and processed immediately. The row is removed by the
/// FK cascade when the user is finally deleted, or explicitly when the user cancels.
/// </summary>
public class AccountDeletionRequest
{
    public Guid UserId { get; set; }

    public DateTimeOffset RequestedAt { get; set; }

    /// <summary>When the data is deleted. Processing picks up rows whose time has passed.</summary>
    public DateTimeOffset ScheduledFor { get; set; }

    public bool RequestedByAdmin { get; set; }

    /// <summary>Set when a worker claims the row. Cancelling is refused once this is set; a claim
    /// older than the stale threshold is treated as dead and can be re-claimed.</summary>
    public DateTimeOffset? ProcessingStartedAt { get; set; }

    public string? LastError { get; set; }
    public DateTimeOffset? LastErrorAt { get; set; }

    // The addon API key is "parked" here while deletion is pending, so the addon stops syncing.
    // Cancelling moves it back onto the user, so the addon reconnects with no user action.
    public string? ParkedApiKey { get; set; }
    public string? ParkedApiKeyLookup { get; set; }
    public DateTimeOffset? ParkedApiKeyCreatedAt { get; set; }
}
