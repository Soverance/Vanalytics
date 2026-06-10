namespace Vanalytics.Core.Models;

// A record that a user applied to a linkshell. Deliberately carries NO status
// lifecycle — the application itself is a fanned-out DM to leadership. This row
// exists only to enforce the re-apply cooldown and drive the Apply button state.
public class LinkshellApplication
{
    public Guid Id { get; set; }
    public Guid LinkshellId { get; set; }

    /// <summary>The user who applied.</summary>
    public Guid ApplicantUserId { get; set; }

    /// <summary>The character they applied as (informational; same server as the LS).</summary>
    public Guid CharacterId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>Leaders the DM was actually delivered to (excludes those who blocked the applicant).</summary>
    public int RecipientCount { get; set; }

    public Linkshell Linkshell { get; set; } = null!;
}
