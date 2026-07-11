using Vanalytics.Core.Services.Achievements;

namespace Vanalytics.Core.DTOs.Achievements;

public record CharacterAchievementResponse(
    int TotalScore,
    int RubricVersion,
    DateTimeOffset ComputedAt,
    int? ServerRank,
    int? GlobalRank,
    IReadOnlyList<AchievementCategoryScore> Breakdown);
