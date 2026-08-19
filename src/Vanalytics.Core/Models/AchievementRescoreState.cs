namespace Vanalytics.Core.Models;

/// <summary>
/// Single-row live status of the admin achievement-rescore batch. Id is always 1.
/// Persisted (not in-memory) because the API runs up to 2 replicas — a status poll may land on the
/// replica that isn't running the job. Mirrors <see cref="ScraperRunState"/>.
/// </summary>
public class AchievementRescoreState
{
    public int Id { get; set; }

    /// <summary>True while a run is active. Best-effort — cleared on completion or fatal error.</summary>
    public bool IsRunning { get; set; }

    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? FinishedAt { get; set; }

    /// <summary>Characters to process in the current/last run.</summary>
    public int Total { get; set; }

    /// <summary>Characters recomputed so far in the current/last run.</summary>
    public int Processed { get; set; }

    /// <summary>Characters that threw and were skipped in the current/last run.</summary>
    public int Failed { get; set; }

    /// <summary>Bumped as work progresses; drives stall detection (dead replica mid-run).</summary>
    public DateTimeOffset? HeartbeatAt { get; set; }

    public string? LastError { get; set; }
    public DateTimeOffset? LastErrorAt { get; set; }
}
