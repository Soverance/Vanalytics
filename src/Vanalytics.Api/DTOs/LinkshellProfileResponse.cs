namespace Vanalytics.Api.DTOs;

// The auto-generated public linkshell page payload (renamed from LinkshellProfile
// in Phase 3 to free that name for the customization entity).
public class LinkshellProfileResponse
{
    public required Guid LinkshellId { get; init; }   // address for manage endpoints
    public required string Name { get; init; }
    public required string Server { get; init; }
    public int ColorRgb { get; init; }
    public int MemberCount { get; init; }
    public int PublicMemberCount { get; init; }
    public int PrivateMemberCount { get; init; }
    public DateTimeOffset? LastActiveAt { get; init; }
    public string RecruitmentStatus { get; init; } = "Unknown"; // from profile row, else "Unknown"
    public bool CanManage { get; init; }                         // true only for an authed current officer
    public bool IsPublic { get; init; }                          // linkshell public-listing flag

    /// <summary>Apply button state for the current viewer: Closed | NotLoggedIn |
    /// NoEligibleCharacter | AlreadyMember | OnCooldown | NoReachableLeaders | Open.</summary>
    public string ApplyState { get; init; } = "Closed";

    /// <summary>When OnCooldown, the moment the viewer may re-apply; else null.</summary>
    public DateTimeOffset? CooldownUntil { get; init; }

    public LinkshellCustomization? Profile { get; init; }        // null until a profile row exists
    public required List<LinkshellMemberRow> Members { get; init; }
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
