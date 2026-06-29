namespace Vanalytics.Core.DTOs.Blueprints;

public class BlueprintResponse
{
    public string Job { get; set; } = string.Empty;
    public BlueprintGraphDto Graph { get; set; } = new();
    public DateTimeOffset? UpdatedAt { get; set; }   // null when no blueprint saved yet
}
