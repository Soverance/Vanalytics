using System.Collections.Generic;

namespace Vanalytics.Core.Services.Achievements;

/// <summary>
/// Fully pre-decoded input for <see cref="AchievementScoringService"/>. Assembled by
/// the API's recompute service from the DB; the scorer itself touches no database.
/// </summary>
public record AchievementScoreInput
{
    public IReadOnlyList<int> JobLevels { get; init; } = [];           // each job's level (1–99)
    public IReadOnlyList<int> MasterLevels { get; init; } = [];       // per job, 0-50
    public int SuperiorLevel { get; init; }
    public IReadOnlyList<int> UltimateWeaponRanks { get; init; } = []; // highest owned rank per owned weapon
    public int CompletedMissionLines { get; init; }                   // 0-14
    public IReadOnlyList<int> JpSpentByJob { get; init; } = [];
    public int MeritsSpent { get; init; }
    public int SpellsLearned { get; init; }
    public int TrustsLearned { get; init; }
    public int TitlesCollected { get; init; }
    public int KeyItemsHeld { get; init; }
    public IReadOnlyList<int> CraftLevels { get; init; } = [];        // per craft, 0-110
    public IReadOnlyList<SkillProgress> Skills { get; init; } = [];   // each skill's level + cap
    public int WarpsUnlocked { get; init; }
    public int NationRank { get; init; }

    // Denominators for progress bars (defaults reflect current game content).
    public int TotalJobs { get; init; } = 22;
    public int TotalMissionLines { get; init; } = 14;
}

/// <summary>Skill level + cap pair used for partial-credit scoring.</summary>
public record SkillProgress(int Level, int Cap);
