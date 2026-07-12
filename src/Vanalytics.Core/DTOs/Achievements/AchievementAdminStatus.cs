namespace Vanalytics.Core.DTOs.Achievements;

/// <summary>
/// Admin view of achievement-scoring freshness: how many characters are scored at the
/// current rubric version, and therefore whether a batch rescore/backfill is needed
/// (<see cref="NeedsRescore"/> &gt; 0).
/// </summary>
public record AchievementAdminStatus(
    int CurrentRubricVersion,
    int TotalCharacters,
    int ScoredAtCurrentVersion,
    int NeedsRescore,
    DateTimeOffset? OldestComputedAt,
    DateTimeOffset? LastComputedAt);
