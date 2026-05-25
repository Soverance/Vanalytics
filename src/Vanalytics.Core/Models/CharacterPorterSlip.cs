namespace Vanalytics.Core.Models;

public class CharacterPorterSlip
{
    public long Id { get; set; }
    public Guid CharacterId { get; set; }
    public int SlipItemId { get; set; }
    public int SlipNumber { get; set; }
    public DateTimeOffset SyncedAt { get; set; }
    public bool UserHidden { get; set; }

    public Character Character { get; set; } = null!;
}
