namespace Vanalytics.Core.DTOs.Achievements;

/// <summary>Live snapshot of the admin achievement-rescore batch, for polling.</summary>
public record AchievementRescoreStatus(
    bool IsRunning,
    bool IsStalled,
    int Processed,
    int Total,
    int Failed,
    DateTimeOffset? StartedAt,
    DateTimeOffset? FinishedAt,
    string? LastError,
    DateTimeOffset? LastErrorAt);
