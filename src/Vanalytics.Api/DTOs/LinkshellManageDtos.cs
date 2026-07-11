namespace Vanalytics.Api.DTOs;

// The customizable part of a linkshell profile, surfaced on the public page.
public class LinkshellCustomization
{
    public string? LogoUrl { get; init; }
    public string? Description { get; init; }      // sanitized HTML
    public string? RecruitmentRules { get; init; } // sanitized HTML
    public List<LinkshellExternalLink> ExternalLinks { get; init; } = [];
}

public class LinkshellExternalLink
{
    public string Label { get; init; } = "";
    public string Url { get; init; } = "";
}

// PUT body for the text fields (logo is its own multipart endpoint).
public class UpdateLinkshellProfileRequest
{
    public string? Description { get; init; }
    public string RecruitmentStatus { get; init; } = "Unknown"; // enum name
    public string? RecruitmentRules { get; init; }
    public List<LinkshellExternalLink> ExternalLinks { get; init; } = [];
    // Nullable on purpose: this endpoint is full-replace for the text fields, but
    // visibility must NOT be clobbered by a caller that omits it. Only when a value
    // is sent does the linkshell's public listing change.
    public bool? IsPublic { get; init; }
}
