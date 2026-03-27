namespace Vanalytics.Core.Models;

public class DismissedAnomaly
{
    public long Id { get; set; }
    public Guid CharacterId { get; set; }
    public string AnomalyKey { get; set; } = string.Empty;
    public DateTimeOffset DismissedAt { get; set; }

    public Character Character { get; set; } = null!;
}
