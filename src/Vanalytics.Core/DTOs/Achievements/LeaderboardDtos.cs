namespace Vanalytics.Core.DTOs.Achievements;

public record CharacterLeaderboardEntry(
    int Rank, Guid CharacterId, string Name, string Server, int TotalScore,
    DateTimeOffset? LastSyncAt, string? Linkshell);

public record LinkshellLeaderboardEntry(
    int Rank, Guid LinkshellId, string Name, string Server, int TotalScore,
    double AverageScore, int RankedMemberCount, int ColorRgb);

public record LeaderboardPage<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);
