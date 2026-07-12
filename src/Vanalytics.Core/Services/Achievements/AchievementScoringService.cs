using System;
using System.Collections.Generic;
using System.Linq;
using Vanalytics.Core.Data;

namespace Vanalytics.Core.Services.Achievements;

public static class AchievementScoringService
{
    public static AchievementScore Score(AchievementScoreInput i)
    {
        var cats = new List<AchievementCategoryScore>();

        int jobLevelSum = i.JobLevels.Sum();
        int jobsMaxed = i.JobLevels.Count(l => l >= 99);
        cats.Add(new("jobs", "Job Levels", jobLevelSum * AchievementRubric.PointsPerJobLevel,
            jobsMaxed, i.TotalJobs, $"{jobLevelSum} total levels · {jobsMaxed}/{i.TotalJobs} at 99"));

        int mlSum = i.MasterLevels.Sum();
        cats.Add(new("master", "Master Levels", mlSum * AchievementRubric.PointsPerMasterLevel,
            null, null, $"{mlSum} total master levels"));

        cats.Add(new("superior", "Superior Level",
            i.SuperiorLevel * AchievementRubric.PointsPerSuperiorLevel,
            i.SuperiorLevel, null, $"Su{i.SuperiorLevel}"));

        int uw = i.UltimateWeaponRanks.Sum(AchievementRubric.PointsForUwRank);
        cats.Add(new("ultimate", "Ultimate Weapons", uw,
            i.UltimateWeaponRanks.Count(r => r >= 75), null,
            $"{i.UltimateWeaponRanks.Count(r => r >= 75)} weapons"));

        cats.Add(new("missions", "Storyline Missions",
            i.CompletedMissionLines * AchievementRubric.PointsPerMissionLine,
            i.CompletedMissionLines, i.TotalMissionLines,
            $"{i.CompletedMissionLines} / {i.TotalMissionLines} lines complete"));

        int jp = i.JpSpentByJob.Sum(spent =>
            Math.Min(spent / AchievementRubric.JpPerPoint, AchievementRubric.JpPointCapPerJob));
        cats.Add(new("jobpoints", "Job Points", jp, null, null,
            $"{i.JpSpentByJob.Sum()} JP spent"));

        int merits = Math.Min(i.MeritsSpent, AchievementRubric.MeritPointCap);
        cats.Add(new("merits", "Merit Points", merits, null, null, $"{i.MeritsSpent} merits"));

        cats.Add(new("spells", "Spells", i.SpellsLearned * AchievementRubric.PointsPerSpell,
            null, null, $"{i.SpellsLearned} spells"));

        cats.Add(new("trusts", "Trusts", i.TrustsLearned * AchievementRubric.PointsPerTrust,
            null, null, $"{i.TrustsLearned} trusts"));

        cats.Add(new("titles", "Titles", i.TitlesCollected * AchievementRubric.PointsPerTitle,
            null, null, $"{i.TitlesCollected} titles"));

        cats.Add(new("keyitems", "Key Items",
            i.KeyItemsHeld / AchievementRubric.KeyItemsPerPoint, null, null,
            $"{i.KeyItemsHeld} key items"));

        int craft = i.CraftLevels.Sum() * AchievementRubric.PointsPerCraftLevel;
        cats.Add(new("crafting", "Crafting", craft, null, null,
            $"{i.CraftLevels.Sum()} combined craft levels"));

        double skillRaw = i.Skills
            .Where(s => s.Cap > 0)
            .Sum(s => AchievementRubric.MaxPointsPerSkill * Math.Min((double)s.Level / s.Cap, 1.0));
        int skillPts = (int)Math.Round(skillRaw, MidpointRounding.AwayFromZero);
        int skillsCapped = i.Skills.Count(s => s.Cap > 0 && s.Level >= s.Cap);
        cats.Add(new("skills", "Skills", skillPts, null, null, $"{skillsCapped} skills at cap"));

        int nation = i.NationRank * AchievementRubric.PointsPerNationRank
                     + i.WarpsUnlocked * AchievementRubric.PointsPerWarp;
        cats.Add(new("nation", "Nation & Explore", nation, null, null,
            $"Rank {i.NationRank}, {i.WarpsUnlocked} warps"));

        return new AchievementScore(cats.Sum(c => c.Points), cats);
    }
}
