namespace Vanalytics.Core.DTOs.Achievements;

public record LinkshellAchievementResponse(
    int TotalScore, double AverageScore, int RankedMemberCount,
    int? GlobalRank, int? ServerRank,
    IReadOnlyList<CharacterLeaderboardEntry> Members);
