namespace Vanalytics.Core.Models;

/// <summary>1:1 with Character. Materialized achievement score + cached per-category
/// breakdown. Recomputed at the end of each sync and by the admin rescore batch.</summary>
public class CharacterAchievement
{
    public Guid CharacterId { get; set; }
    public int TotalScore { get; set; }
    public string BreakdownJson { get; set; } = "[]";
    public int RubricVersion { get; set; }
    public DateTimeOffset ComputedAt { get; set; }

    public Character Character { get; set; } = null!;
}
