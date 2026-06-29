namespace Vanalytics.Core.DTOs.Blueprints;

/// <summary>One validation finding for a blueprint, surfaced when the user clicks Generate.</summary>
public class Diagnostic
{
    public string Severity { get; set; } = "error";   // "error" | "warning"
    public string Message { get; set; } = string.Empty;
    public string? NodeId { get; set; }                // null = graph-wide (e.g. empty blueprint)
}
