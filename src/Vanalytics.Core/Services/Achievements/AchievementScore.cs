using System.Collections.Generic;

namespace Vanalytics.Core.Services.Achievements;

/// <summary>One category's contribution. Current/Total drive an optional progress bar;
/// both null means "show the number, no bar" (open-ended categories like titles).</summary>
public record AchievementCategoryScore(
    string Key, string Name, int Points, int? Current, int? Total, string Detail);

public record AchievementScore(int Total, IReadOnlyList<AchievementCategoryScore> Categories);
