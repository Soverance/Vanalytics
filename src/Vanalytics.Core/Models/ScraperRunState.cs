namespace Vanalytics.Core.Models;

/// <summary>
/// Single-row live status of the AH scraper background loop. Id is always 1.
/// Written by the scraper each cycle so the admin UI can show a heartbeat instead of guessing.
/// </summary>
public class ScraperRunState
{
    public int Id { get; set; }

    /// <summary>True while a cycle is actively running. Best-effort — reset on completion or cycle error.</summary>
    public bool IsRunning { get; set; }

    /// <summary>When the most recent cycle began.</summary>
    public DateTimeOffset? LastCycleStartedAt { get; set; }

    /// <summary>When the most recent cycle finished (the freshness signal for "is it working?").</summary>
    public DateTimeOffset? LastCycleFinishedAt { get; set; }

    /// <summary>Eligible worlds processed in the last completed cycle.</summary>
    public int WorldsProcessedLastCycle { get; set; }

    /// <summary>New sale rows ingested across all worlds in the last completed cycle.</summary>
    public int SalesIngestedLastCycle { get; set; }

    /// <summary>Message from the last whole-cycle failure (null once a cycle completes cleanly).</summary>
    public string? LastError { get; set; }

    /// <summary>When <see cref="LastError"/> was recorded.</summary>
    public DateTimeOffset? LastErrorAt { get; set; }
}
