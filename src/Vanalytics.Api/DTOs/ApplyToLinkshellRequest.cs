namespace Vanalytics.Api.DTOs;

// Body for POST /api/linkshells/{linkshellId}/apply.
public class ApplyToLinkshellRequest
{
    /// <summary>The applicant's character to apply as (must be theirs, same server as the LS).</summary>
    public Guid CharacterId { get; set; }

    /// <summary>Free-text intro the applicant writes; becomes the DM body.</summary>
    public string Intro { get; set; } = string.Empty;
}
