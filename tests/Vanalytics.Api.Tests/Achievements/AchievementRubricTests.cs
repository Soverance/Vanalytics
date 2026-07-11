using System.Linq;
using Vanalytics.Core.Data;
using Xunit;

namespace Vanalytics.Api.Tests.Achievements;

public class AchievementRubricTests
{
    [Fact]
    public void Version_IsPositive() => Assert.True(AchievementRubric.Version >= 1);

    [Fact]
    public void Categories_CoverAllFourteen() =>
        Assert.Equal(14, AchievementRubric.Categories.Count);

    [Fact]
    public void Categories_HaveUniqueKeys() =>
        Assert.Equal(AchievementRubric.Categories.Count,
                     AchievementRubric.Categories.Select(c => c.Key).Distinct().Count());

    [Theory]
    [InlineData(1000, 200)] // Afterglow = complete
    [InlineData(900, 160)]  // Reforged (iL119)
    [InlineData(800, 120)]  // Lv.99 Augmented
    [InlineData(99, 90)]    // Lv.99
    [InlineData(90, 60)]    // Lv.90-98
    [InlineData(80, 35)]    // Lv.80-89
    [InlineData(75, 20)]    // base
    [InlineData(-1, 0)]     // unclassifiable => 0
    public void PointsForUwRank_MapsStages(int rank, int expected) =>
        Assert.Equal(expected, AchievementRubric.PointsForUwRank(rank));
}
