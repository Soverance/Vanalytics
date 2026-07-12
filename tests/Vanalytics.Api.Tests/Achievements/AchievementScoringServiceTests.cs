using System.Collections.Generic;
using System.Linq;
using Vanalytics.Core.Data;
using Vanalytics.Core.Services.Achievements;
using Xunit;

namespace Vanalytics.Api.Tests.Achievements;

public class AchievementScoringServiceTests
{
    [Fact]
    public void EmptyInput_ScoresZero()
    {
        var score = AchievementScoringService.Score(new AchievementScoreInput());
        Assert.Equal(0, score.Total);
        Assert.All(score.Categories, c => Assert.Equal(0, c.Points));
    }

    [Fact]
    public void Jobs_ScorePerLevel()
    {
        // 99 + 50 = 149 total levels → 149 pts; 1 job at 99
        var score = AchievementScoringService.Score(
            new AchievementScoreInput { JobLevels = new[] { 99, 50 } });
        Assert.Equal(149, score.Total);
        var jobs = score.Categories.Single(c => c.Key == "jobs");
        Assert.Equal(149, jobs.Points);
        Assert.Equal(1, jobs.Current);   // 1 job at 99
        Assert.Equal(22, jobs.Total);
    }

    [Fact]
    public void MasterLevels_SumTimesTwo()
    {
        var score = AchievementScoringService.Score(
            new AchievementScoreInput { MasterLevels = new[] { 50, 10, 0 } });
        Assert.Equal(120, score.Categories.Single(c => c.Key == "master").Points);
    }

    [Fact]
    public void JobPoints_CappedPerJob()
    {
        // 40000 JP / 100 = 400 pts, capped at 300; second job 5000/100 = 50
        var score = AchievementScoringService.Score(
            new AchievementScoreInput { JpSpentByJob = new[] { 40000, 5000 } });
        Assert.Equal(350, score.Categories.Single(c => c.Key == "jobpoints").Points);
    }

    [Fact]
    public void Merits_Capped()
    {
        var score = AchievementScoringService.Score(
            new AchievementScoreInput { MeritsSpent = 5000 });
        Assert.Equal(AchievementRubric.MeritPointCap,
                     score.Categories.Single(c => c.Key == "merits").Points);
    }

    [Fact]
    public void KeyItems_HalfPointEach()
    {
        var score = AchievementScoringService.Score(
            new AchievementScoreInput { KeyItemsHeld = 7 });
        Assert.Equal(3, score.Categories.Single(c => c.Key == "keyitems").Points); // 7/2
    }

    [Fact]
    public void UltimateWeapons_SumStagePoints()
    {
        var score = AchievementScoringService.Score(
            new AchievementScoreInput { UltimateWeaponRanks = new[] { 1000, 90 } });
        Assert.Equal(260, score.Categories.Single(c => c.Key == "ultimate").Points); // 200 + 60
    }

    [Fact]
    public void Skills_PartialCredit()
    {
        // 200/400 cap → 5×0.5 = 2.5; 400/400 cap → 5×1.0 = 5.0 → sum 7.5 → rounds AwayFromZero → 8
        var score = AchievementScoringService.Score(new AchievementScoreInput
        {
            Skills = new[] { new SkillProgress(200, 400), new SkillProgress(400, 400) }
        });
        Assert.Equal(8, score.Categories.Single(c => c.Key == "skills").Points);
    }

    [Fact]
    public void GoldenCharacter_TotalsAllCategories()
    {
        var input = new AchievementScoreInput
        {
            // v2 rubric — jobs: 1 pt/level; skills: 5 × (level/cap) rounded once
            JobLevels = new[] { 99, 99 },       // sum=198 levels → 198 pts, 2 at 99
            MasterLevels = new[] { 10, 5 },     // 30
            SuperiorLevel = 2,                  // 100
            UltimateWeaponRanks = new[] { 800 },// 120
            CompletedMissionLines = 3,          // 225
            JpSpentByJob = new[] { 200 },       // 2
            MeritsSpent = 100,                  // 100
            SpellsLearned = 50,                 // 50
            TrustsLearned = 10,                 // 20
            TitlesCollected = 40,               // 40
            KeyItemsHeld = 20,                  // 10
            CraftLevels = new[] { 110, 60 },    // 170
            Skills = new[]                      // 6 skills all at cap → 6×5×1.0 = 30
            {
                new SkillProgress(100, 100), new SkillProgress(100, 100),
                new SkillProgress(100, 100), new SkillProgress(100, 100),
                new SkillProgress(100, 100), new SkillProgress(100, 100),
            },
            WarpsUnlocked = 15,                 // 15
            NationRank = 10,                    // 100
        };
        var score = AchievementScoringService.Score(input);
        // 198+30+100+120+225+2+100+50+20+40+10+170+30+15+100 = 1210
        Assert.Equal(1210, score.Total);
        Assert.Equal(input.CompletedMissionLines, score.Categories.Single(c => c.Key == "missions").Current);
    }
}
