namespace Vanalytics.Core.DTOs.Characters;

public class CharacterSummaryResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Server { get; set; } = string.Empty;
    public string LicenseStatus { get; set; } = string.Empty;
    public bool IsPublic { get; set; }
    public DateTimeOffset? LastSyncAt { get; set; }
}
