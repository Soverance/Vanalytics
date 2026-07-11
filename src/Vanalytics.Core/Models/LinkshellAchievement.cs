namespace Vanalytics.Core.Models;

/// <summary>1:1 with Linkshell. Aggregates of current public members' scores.</summary>
public class LinkshellAchievement
{
    public Guid LinkshellId { get; set; }
    public int TotalScore { get; set; }
    public double AverageScore { get; set; }
    public int RankedMemberCount { get; set; }
    public DateTimeOffset ComputedAt { get; set; }

    public Linkshell Linkshell { get; set; } = null!;
}
