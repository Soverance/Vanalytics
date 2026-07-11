namespace Vanalytics.Api.DTOs;

// One row in the public /linkshells directory.
public class LinkshellListItem
{
    public required string Name { get; init; }
    public required string Server { get; init; }
    public int ColorRgb { get; init; }
    public int MemberCount { get; init; }        // current members (public + private)
    public int PublicMemberCount { get; init; }  // current members whose character IsPublic
    public DateTimeOffset? LastActiveAt { get; init; }
    public string? LogoUrl { get; init; }        // from the LS profile, null if none
    public string RecruitmentStatus { get; init; } = "Unknown"; // from the profile, else "Unknown"
    public int TotalScore { get; init; }         // 0 when no achievement row exists
    public double AverageScore { get; init; }    // 0 when no achievement row exists
    public int RankedMemberCount { get; init; }  // 0 when no achievement row exists
}
