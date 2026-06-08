namespace Vanalytics.Api.DTOs;

// The auto-generated public linkshell profile page payload.
public class LinkshellProfile
{
    public required string Name { get; init; }
    public required string Server { get; init; }
    public int ColorRgb { get; init; }
    public int MemberCount { get; init; }
    public int PublicMemberCount { get; init; }
    public int PrivateMemberCount { get; init; }
    public DateTimeOffset? LastActiveAt { get; init; }
    public string RecruitmentStatus { get; init; } = "Unknown"; // static until Phase 3
    public required List<LinkshellMemberRow> Members { get; init; } // public current members, pre-sorted
}

// One named (public current) member, pre-sorted rank -> name server-side.
public class LinkshellMemberRow
{
    public required string Name { get; init; }
    public required string Rank { get; init; }   // "Leader" | "Sackholder" | "Member"
    public string? Job { get; init; }            // active job abbrev, e.g. "WAR"
    public int? Level { get; init; }
    public required DateTimeOffset LastSeen { get; init; }
}
