namespace Vanalytics.Core.Data;

/// <summary>
/// Single source of truth for achievement scoring. Every point value lives here,
/// and <see cref="Categories"/> is what the public "How scoring works" page renders
/// (via GET /achievements/rubric) so documentation cannot drift from the engine.
/// Bump <see cref="Version"/> whenever any value changes, then run the admin rescore.
/// </summary>
public static class AchievementRubric
{
    public const int Version = 1;

    // Per-unit point values
    public const int PointsPerJobAt99 = 50;
    public const int PointsPerMasterLevel = 2;
    public const int PointsPerSuperiorLevel = 50;
    public const int PointsPerMissionLine = 75;
    public const int PointsPerSpell = 1;
    public const int PointsPerTrust = 2;
    public const int PointsPerTitle = 1;
    public const int PointsPerCraftLevel = 1;
    public const int PointsPerSkillAtCap = 5;
    public const int PointsPerWarp = 1;
    public const int PointsPerNationRank = 10;

    // Divisors / caps (integer expression of fractional intent)
    public const int KeyItemsPerPoint = 2;   // "0.5 per key item"
    public const int JpPerPoint = 100;        // 1 point per 100 JP spent
    public const int JpPointCapPerJob = 300;  // max JP-derived points per job
    public const int MeritPointCap = 1200;    // max merit-derived points

    /// <summary>
    /// Points for one owned ultimate weapon given its <see cref="UltimateWeaponStage.Rank"/>.
    /// Scaled by upgrade progress, capped at 200 for a completed (Afterglow) weapon.
    /// </summary>
    public static int PointsForUwRank(int rank) => rank switch
    {
        >= 1000 => 200, // Afterglow (complete)
        >= 900  => 160, // Reforged (iL119)
        >= 800  => 120, // Lv.99 Augmented
        99      => 90,  // Lv.99
        >= 90   => 60,  // Lv.90-98
        >= 80   => 35,  // Lv.80-89
        >= 75   => 20,  // Lv.75-79 base
        _       => 0,   // unclassifiable / not owned
    };

    public record RubricCategory(string Key, string Name, string Description, string Scoring);

    public static readonly IReadOnlyList<RubricCategory> Categories =
    [
        new("jobs",    "Jobs Mastered",      "Each job leveled to 99.",                          $"{PointsPerJobAt99} points per job at 99"),
        new("master",  "Master Levels",      "Master levels earned across all jobs.",            $"{PointsPerMasterLevel} points per master level"),
        new("superior","Superior Level",     "Character-wide Superior (Su) level.",              $"{PointsPerSuperiorLevel} points per Su level"),
        new("ultimate","Ultimate Weapons",   "Relic/Mythic/Empyrean/Aeonic/Prime weapons, scaled by upgrade stage.", "Up to 200 points per weapon by stage"),
        new("missions","Storyline Missions", "Each of the 14 mission storylines completed.",     $"{PointsPerMissionLine} points per completed line"),
        new("jobpoints","Job Points",        "Job points spent, capped per job.",                $"1 point per {JpPerPoint} JP spent (max {JpPointCapPerJob}/job)"),
        new("merits",  "Merit Points",       "Merit points spent, capped.",                      $"1 point per merit (max {MeritPointCap})"),
        new("spells",  "Spells",             "Distinct spells learned.",                         $"{PointsPerSpell} point per spell"),
        new("trusts",  "Trusts",             "Trust alter egos unlocked.",                       $"{PointsPerTrust} points per trust"),
        new("titles",  "Titles",             "Titles collected.",                                $"{PointsPerTitle} point per title"),
        new("keyitems","Key Items",          "Key items held.",                                  $"1 point per {KeyItemsPerPoint} key items"),
        new("crafting","Crafting",           "Combined crafting skill levels.",                  $"{PointsPerCraftLevel} point per craft level"),
        new("skills",  "Skills Capped",      "Combat and magic skills at their cap.",            $"{PointsPerSkillAtCap} points per capped skill"),
        new("nation",  "Nation & Explore",   "Nation rank and unlocked warps.",                  $"{PointsPerNationRank} points per nation rank, {PointsPerWarp} per warp"),
    ];
}
