namespace Vanalytics.Core.Models;

// One row per distinct in-game linkshell, identified by (Server, GameLinkshellId).
// Name and ColorRgb are mutable display attributes refreshed on each sync.
public class Linkshell
{
    public Guid Id { get; set; }
    public string Server { get; set; } = string.Empty;

    /// <summary>The extdata linkshell_id — stable in-game identifier.</summary>
    public long GameLinkshellId { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>Packed RGB: (r &lt;&lt; 16) | (g &lt;&lt; 8) | b.</summary>
    public int ColorRgb { get; set; }

    /// <summary>Denormalized count of current members (maintained on sync).</summary>
    public int MemberCount { get; set; }

    public DateTimeOffset FirstSeenAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }

    public List<LinkshellMembership> Memberships { get; set; } = [];

    /// <summary>Optional leader-customized profile (Phase 3); null until claimed.</summary>
    public LinkshellProfile? Profile { get; set; }
}
