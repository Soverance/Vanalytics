namespace Vanalytics.Core.Models;

public class CharacterPorterItem
{
    public long Id { get; set; }
    public Guid CharacterId { get; set; }
    public int SlipItemId { get; set; }
    public int SlipNumber { get; set; }
    public int ItemId { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }

    public Character Character { get; set; } = null!;
}
