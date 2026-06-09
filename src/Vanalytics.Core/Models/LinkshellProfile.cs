using Vanalytics.Core.Enums;

namespace Vanalytics.Core.Models;

// Leader/Sackholder-customizable public profile for a linkshell. 1:1 with
// Linkshell, created lazily on first save (implicit claim). OwnerUserId records
// the first claimant for attribution only — it is NOT used for authorization
// (edit rights are live-computed from current Leader/Sackholder memberships).
public class LinkshellProfile
{
    public Guid Id { get; set; }
    public Guid LinkshellId { get; set; }

    /// <summary>First claimant; attribution only, never consulted for authz.</summary>
    public Guid OwnerUserId { get; set; }

    public string? LogoBlobUrl { get; set; }

    /// <summary>Sanitized TipTap HTML.</summary>
    public string? Description { get; set; }

    public RecruitmentStatus RecruitmentStatus { get; set; } = RecruitmentStatus.Unknown;

    /// <summary>Sanitized TipTap HTML.</summary>
    public string? RecruitmentRules { get; set; }

    /// <summary>JSON array of {label,url}; defaults to "[]".</summary>
    public string ExternalLinksJson { get; set; } = "[]";

    public DateTimeOffset UpdatedAt { get; set; }

    public Linkshell Linkshell { get; set; } = null!;
}
