using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

// A character's membership in a linkshell. Many-to-many: a character can be in
// up to two at once (LS1 + LS2). Never hard-deleted; departure is recorded by
// flipping IsCurrent to false (mirrors the CharacterTitles freshness pattern).
public class LinkshellMembership
{
    public Guid Id { get; set; }
    public Guid CharacterId { get; set; }
    public Guid LinkshellId { get; set; }

    /// <summary>Equipped slot it was last seen in (1 or 2). 0 if unknown.</summary>
    public int Slot { get; set; }

    public LinkshellRank Rank { get; set; }

    /// <summary>True while the character's latest sync still reports this LS.</summary>
    public bool IsCurrent { get; set; }

    public DateTimeOffset FirstSeenAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }

    public Character Character { get; set; } = null!;
    public Linkshell Linkshell { get; set; } = null!;
}
